const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
initializeApp();
const db = getFirestore();

exports.sendNotificationPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
  const n = event.data && event.data.data();
  if (!n) return;
  let users = [];
  if (Array.isArray(n.userIds) && n.userIds.length) {
    const snaps = await Promise.all(n.userIds.map(id => db.collection("users").doc(id).get()));
    users = snaps.filter(s => s.exists).map(s => ({ id:s.id, ...s.data() }));
  } else {
    const snap = await db.collection("users").get();
    users = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => {
      if (u.active === false) return false;
      if (n.audience === "chair") return u.role === "chair";
      if (n.audience === "starost") return u.role !== "chair";
      return true;
    });
  }
  const tokens = [...new Set(users.flatMap(u => Array.isArray(u.fcmTokens) ? u.fcmTokens : []))];
  if (!tokens.length) return;
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: String(n.title || "Совет старост"), body: String(n.text || "").slice(0, 240) },
    webpush: { fcmOptions: { link: "https://ggwave.github.io/sovetstarost/" }, notification: { icon: "https://ggwave.github.io/sovetstarost/icon-192.png" } }
  });
  const dead = [];
  response.responses.forEach((r, i) => {
    if (!r.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error && r.error.code)) dead.push(tokens[i]);
  });
  if (dead.length) {
    const batch = db.batch();
    for (const u of users) {
      const remain = (u.fcmTokens || []).filter(t => !dead.includes(t));
      if (remain.length !== (u.fcmTokens || []).length) batch.update(db.collection("users").doc(u.id), { fcmTokens: remain });
    }
    await batch.commit();
  }
});
