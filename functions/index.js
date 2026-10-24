const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { logger } = require('firebase-functions');

initializeApp();
const db = getFirestore();
const DEFAULT_PREFS = { newPoll: true, meeting: true, chat: true, announcement: true, decision: true, reminder: true };

function isoNow() { return new Date().toISOString(); }
function eventText(data, type) {
  if (type === 'newPoll') return { title: `Началось новое голосование: ${data.title || 'Без названия'}`, body: data.description || 'Открой сайт, чтобы проголосовать.', linkPage: 's-polls', kind: 'голосование' };
  if (type === 'meeting') return { title: `Назначено собрание: ${data.title || 'Без названия'}`, body: [data.date, data.time, data.place].filter(Boolean).join(' · '), linkPage: 's-meetings', kind: 'собрание' };
  if (type === 'chat') return { title: `Новое сообщение · ${data.senderName || 'Участник'}`, body: String(data.text || '').slice(0, 180), linkPage: 's-notifications', kind: 'чат' };
  if (type === 'announcement') return { title: `Новое важное объявление: ${data.title || 'Без названия'}`, body: String(data.text || '').slice(0, 180), linkPage: 's-ann', kind: 'объявление' };
  if (type === 'decision') return { title: `Опубликовано решение: ${data.title || data.name || 'Новое решение'}`, body: String(data.description || data.text || '').slice(0, 180), linkPage: 'archive', kind: 'решение' };
  if (type === 'reminder') return { title: `Скоро: ${data.title || 'событие'}`, body: [data.date, data.time, data.place].filter(Boolean).join(' · '), linkPage: data._collection === 'meetings' ? 's-meetings' : 's-events', kind: 'напоминание' };
  return { title: 'Уведомление совета старост', body: '', linkPage: 's-notifications', kind: type };
}

async function sendEvent(type, data, { inApp = false, onlyUserIds = null } = {}) {
  const usersSnap = await db.collection('users').get();
  const tokens = [];
  const eligibleUsers = [];
  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (user.active === false) continue;
    if (onlyUserIds && !onlyUserIds.includes(doc.id)) continue;
    const prefs = { ...DEFAULT_PREFS, ...(user.notificationPrefs || {}) };
    if (prefs[type] === false) continue;
    eligibleUsers.push({ id: doc.id, data: user });
    for (const token of (Array.isArray(user.fcmTokens) ? user.fcmTokens : [])) {
      if (typeof token === 'string' && token.length > 20) tokens.push({ token, userId: doc.id });
    }
  }
  const message = eventText(data, type);
  if (inApp && eligibleUsers.length) {
    await db.collection('notifications').add({
      title: message.title, text: message.body, kind: message.kind, audience: 'all', userIds: onlyUserIds || [],
      linkPage: message.linkPage, readBy: {}, created: isoNow(), source: 'cloud-function', eventKey: type,
    });
  }
  if (!tokens.length) return;
  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(x => x.token),
    notification: { title: message.title, body: message.body || 'Открой сайт «Совет старост».' },
    data: { linkPage: message.linkPage || 's-notifications', eventKey: type },
    webpush: { fcmOptions: { link: `./#${message.linkPage || 's-notifications'}` }, notification: { icon: './icon-192.png', badge: './icon-192.png' } },
  });
  const invalid = [];
  response.responses.forEach((r, i) => {
    if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) invalid.push(tokens[i]);
  });
  // Remove invalid tokens from user documents to avoid repeatedly sending to dead devices.
  for (const item of invalid) {
    try { await db.collection('users').doc(item.userId).update({ fcmTokens: FieldValue.arrayRemove(item.token) }); } catch (e) { logger.warn('Could not remove stale token', e); }
  }
  logger.info(`Notification ${type}: ${response.successCount} sent, ${response.failureCount} failed`);
}

exports.notifyNewPoll = onDocumentCreated('polls/{id}', async event => {
  const p = event.data?.data(); if (!p || p.status === 'Черновик') return;
  await sendEvent('newPoll', p, { inApp: true });
});
exports.notifyNewMeeting = onDocumentCreated('meetings/{id}', async event => {
  const m = event.data?.data(); if (!m) return;
  await sendEvent('meeting', m, { inApp: true });
});
exports.notifyChatMessage = onDocumentCreated('chatMessages/{id}', async event => {
  const m = event.data?.data(); if (!m) return;
  // Do not send a push to the person who wrote the message.
  const users = await db.collection('users').get();
  const ids = users.docs.filter(d => d.id !== String(m.senderId || '')).map(d => d.id);
  await sendEvent('chat', m, { inApp: true, onlyUserIds: ids });
});
async function notifyApprovedAnnouncement(data) {
  if (!data || (data.status && !['approved', 'Опубликовано', 'published'].includes(data.status))) return;
  await sendEvent('announcement', data, { inApp: true });
}
exports.notifyNewAnnouncement = onDocumentCreated('announcements/{id}', async event => {
  const data = event.data?.data();
  if (!data) return;
  if (data.status === 'pending') {
    const chairs = (await db.collection('users').get()).docs.filter(d => d.data().role === 'chair').map(d => d.id);
    const prefs = chairs.length ? await Promise.all(chairs.map(async id => (await db.collection('users').doc(id).get()).data()?.notificationPrefs || {})) : [];
    const enabledChairs = chairs.filter((id, i) => prefs[i].announcement !== false);
    if (enabledChairs.length) await db.collection('notifications').add({title: 'Объявление на модерации', text: data.title || '', kind: 'модерация', eventKey: 'announcement', audience: 'chair', userIds: enabledChairs, linkPage: 'announcements', readBy: {}, created: isoNow(), source: 'cloud-function'});
    return;
  }
  await notifyApprovedAnnouncement(data);
});
exports.notifyApprovedAnnouncement = onDocumentUpdated('announcements/{id}', async event => {
  const before = event.data?.before.data(); const after = event.data?.after.data();
  const wasApproved = before && ['approved', 'Опубликовано', 'published'].includes(before.status);
  const isApproved = after && ['approved', 'Опубликовано', 'published'].includes(after.status);
  if (!wasApproved && isApproved) await notifyApprovedAnnouncement(after);
});
exports.notifyDecision = onDocumentCreated('decisions/{id}', async event => {
  const d = event.data?.data(); if (!d) return;
  await sendEvent('decision', d, { inApp: true });
});

exports.remindUpcomingEvents = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Europe/Moscow', region: 'europe-west1' }, async () => {
  const now = Date.now();
  const until = now + 30 * 60 * 1000;
  for (const collectionName of ['meetings', 'events']) {
    const snap = await db.collection(collectionName).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.reminderSentAt || !d.date) continue;
      if (collectionName === 'meetings' && ['Отменено', 'Проведено'].includes(d.status)) continue;
      const time = String(d.time || '09:00').slice(0, 5);
      const eventAt = new Date(`${d.date}T${time}:00+03:00`).getTime();
      if (!Number.isFinite(eventAt) || eventAt < now || eventAt > until) continue;
      await sendEvent('reminder', { ...d, _collection: collectionName }, { inApp: true });
      await doc.ref.update({ reminderSentAt: isoNow() });
    }
  }
});
