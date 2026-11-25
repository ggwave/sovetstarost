(function () {
  'use strict';

  const sectors = [
    { id: 'administrative', number: '01', title: 'Административный', short: 'Организация и координация', description: 'Заседания и планы работы; распределение поручений; контроль сроков; координация секторов и общих мероприятий.', icon: '⌘', duties: ['Организация заседаний и собраний Совета', 'Подготовка планов работы и контроль сроков', 'Распределение поручений и координация секторов', 'Рассмотрение проектов секторов: принятие или отправка на доработку'] },
    { id: 'information', number: '02', title: 'Информационный', short: 'Новости и коммуникация', description: 'Информирование учащихся, подготовка материалов и обеспечение обратной связи.', icon: '◉', duties: ['Информирование учащихся о деятельности Совета', 'Подготовка информационных материалов', 'Освещение мероприятий и достижений', 'Обратная связь между Советом и учащимися'] },
    { id: 'culture', number: '03', title: 'Культурно-массовый', short: 'События и творчество', description: 'Организация культурных мероприятий, творческих проектов и школьного досуга.', icon: '✳', duties: ['Организация концертов и культурных мероприятий', 'Проведение творческих проектов', 'Разработка форматов школьного досуга', 'Привлечение учащихся к школьной жизни'] },
    { id: 'social', number: '04', title: 'Социальный', short: 'Взаимопомощь и поддержка', description: 'Благотворительные и добровольческие инициативы, социальные проекты и культура взаимоуважения.', icon: '♡', duties: ['Организация благотворительных и добровольческих инициатив', 'Поддержка школьных социальных проектов', 'Формирование культуры взаимоуважения', 'Развитие ответственности и взаимопомощи'] },
    { id: 'study', number: '05', title: 'Учебно-проектный', short: 'Образовательные инициативы', description: 'Поддержка образовательных инициатив и реализация ученических проектов.', icon: '⌑', duties: ['Поддержка образовательных инициатив учащихся', 'Организация викторин, конкурсов и лекций', 'Содействие реализации ученических проектов', 'Сбор предложений по развитию учебной среды'] },
    { id: 'sport', number: '06', title: 'Спортивный', short: 'Спорт и здоровый образ жизни', description: 'Организация соревнований, популяризация здорового образа жизни и развитие спортивной жизни школы.', icon: '⌁', duties: ['Организация спортивных соревнований и турниров', 'Популяризация здорового образа жизни', 'Привлечение учащихся к спортивным мероприятиям', 'Обработка предложений по улучшению спортивной жизни школы'] }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    auth: null, db: null, profile: null, activePage: 'overview', taskTab: 'tasks',
    listeners: [], voteUnsubs: new Map(),
    initiatives: [], users: [], meetings: [], polls: [], votes: {}, tasks: [], decisions: [],
    announcements: [], documents: [], projects: [], reports: [], sectorPlan: null, sectorPlans: {}, feed: [],
    publicAnnouncements: [], publicMeetings: [], publicDocuments: [], publicProjects: [], publicSectorPlans: [], publicTeam: [],
    feedInitialized: false, publicListeners: [], trackingUrl: '',
    viewedAsPublic: false
  };

  const INITIATIVE_STATUSES = {
    new: 'Новая', reviewing: 'На рассмотрении', accepted: 'Принята', in_progress: 'В работе', done: 'Реализована', rejected: 'Отклонена'
  };
  const TASK_STATUSES = { new: 'Новая', in_progress: 'В работе', done: 'Выполнена', cancelled: 'Отменена' };
  const MEETING_STATUSES = { planned: 'Запланировано', held: 'Проведено', cancelled: 'Отменено' };
  const POLL_STATUSES = { open: 'Голосование открыто', closed: 'Голосование завершено' };
  const PROJECT_STATUSES = { idea: 'Идея', planning: 'Планирование', in_progress: 'В работе', completed: 'Завершён', paused: 'Приостановлен' };
  const DECISION_STATUSES = { accepted: 'Принято', in_progress: 'Исполняется', done: 'Выполнено', rejected: 'Отклонено' };
  const REPORT_STATUSES = { submitted: 'На проверке', accepted: 'Принят', revision: 'На доработке' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
  function profile() { return state.profile || {}; }
  function role() { return profile().role || 'member'; }
  function isChair() { return role() === 'chair'; }
  function forcedSectorId(value = role()) { return ['chair', 'deputy_chair', 'secretary', 'administrative'].includes(value) ? 'administrative' : null; }
  function isAdministrativeRole() { return !!forcedSectorId(); }
  function isSectorLead() { return role() === 'sector_lead'; }
  function canManageInitiatives() { return isAdministrativeRole() || isSectorLead(); }
  function canManageMeetings() { return isAdministrativeRole(); }
  function canManagePolls() { return isAdministrativeRole(); }
  function canManageTasks() { return isAdministrativeRole() || isSectorLead(); }
  function canManageAnnouncements() { return isAdministrativeRole() || profile().sectorId === 'information'; }
  function isInformationSector() { return currentSectorId() === 'information'; }
  function canManageDocuments() { return isAdministrativeRole() || isSectorLead(); }
  function canManageProjects() { return isAdministrativeRole() || isSectorLead(); }
  function currentSectorId() { return forcedSectorId() || profile().sectorId || ''; }
  function currentSector() { return sectors.find(item => item.id === currentSectorId()) || null; }
  function isOwnSector(sectorId) { return isAdministrativeRole() || (!!currentSectorId() && currentSectorId() === sectorId); }
  function roleLabel(value) {
    return ({ chair: 'Председатель Совета', deputy_chair: 'Заместитель председателя', secretary: 'Секретарь Совета', admin: 'Технический администратор', administrative: 'Участник административного сектора', sector_lead: 'Руководитель сектора', member: 'Участник Совета' })[value] || 'Участник Совета';
  }
  function sectorName(id) { return sectors.find(item => item.id === id)?.title || 'Не назначен'; }
  function formatDate(value) {
    if (!value) return 'Дата не указана';
    if (value.toDate) return value.toDate().toLocaleDateString('ru-RU');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('ru-RU');
  }
  function formatDateTime(value) {
    if (!value) return '';
    if (value.toDate) return value.toDate().toLocaleString('ru-RU');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('ru-RU');
  }
  function timestamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function localDateISO() { const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const values = new Uint8Array(length);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
    else for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 256);
    return [...values].map(value => chars[value % chars.length]).join('');
  }
  function generateTrackingId() {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    return `IN-${ymd}-${randomCode(8)}`;
  }
  function trackingLink(id) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = 'track';
    url.searchParams.set('tracking', id);
    return url.toString();
  }
  function statusText(status) { return INITIATIVE_STATUSES[status] || 'Статус уточняется'; }

  function renderSectors() {
    const grid = $('#publicSectorGrid');
    const cards = $('#sectorCards');
    if (grid) grid.innerHTML = sectors.slice(1).map(sector => `
      <a class="org-card" href="#sector-${sector.id}"><span class="org-card-number">${sector.number}</span><div><h4>${sector.title}</h4><p>${escapeHtml(sector.description)}</p></div><span class="org-card-arrow">↗</span></a>
    `).join('');
    if (cards) cards.innerHTML = sectors.map(sector => `
      <article class="sector-card" id="sector-${sector.id}"><div class="sector-card-top"><span class="sector-symbol">${sector.icon}</span><span class="sector-card-number">${sector.number} / 06</span></div><h3>${sector.title}</h3><p class="sector-short">${sector.short}</p><p>${escapeHtml(sector.description)}</p><ul>${sector.duties.slice(0, 3).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
    `).join('');
  }

  function initMobileNavigation() {
    const toggle = $('#menuToggle');
    const nav = $('#publicNav');
    toggle?.addEventListener('click', () => {
      const opened = nav.classList.toggle('open');
      toggle.classList.toggle('open', opened);
      toggle.setAttribute('aria-expanded', String(opened));
    });
    $$('#publicNav a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open'); toggle?.classList.remove('open'); toggle?.setAttribute('aria-expanded', 'false');
    }));
  }

  function showLogin() {
    const overlay = $('#loginOverlay'); overlay?.classList.add('open'); overlay?.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#loginEmail')?.focus(), 100);
  }
  function hideLogin() {
    const overlay = $('#loginOverlay'); overlay?.classList.remove('open'); overlay?.setAttribute('aria-hidden', 'true');
    if ($('#loginError')) $('#loginError').textContent = '';
  }
  function showInitiativeForm() {
    $('#initiativeOverlay')?.classList.add('open'); $('#initiativeOverlay')?.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#initiativeForm [name="title"]')?.focus(), 100);
  }
  function hideInitiativeForm() {
    $('#initiativeOverlay')?.classList.remove('open'); $('#initiativeOverlay')?.setAttribute('aria-hidden', 'true');
    if ($('#initiativeError')) $('#initiativeError').textContent = '';
  }

  function initFirebase() {
    const badge = $('#firebaseStatus');
    try {
      if (!window.firebase || !window.SOVET_FIREBASE_CONFIG) throw new Error('Firebase SDK недоступен');
      if (!firebase.apps.length) firebase.initializeApp(window.SOVET_FIREBASE_CONFIG);
      state.auth = firebase.auth(); state.db = firebase.firestore();
      if (badge) { badge.textContent = 'Firebase · подключён'; badge.classList.add('is-online'); }
      startPublicListeners();
      state.auth.onAuthStateChanged(user => { Promise.resolve(handleAuthState(user)).finally(hidePageLoader); });
    } catch (error) {
      console.error('Firebase initialization:', error);
      if (badge) { badge.textContent = 'Firebase · не подключён'; badge.classList.add('is-offline'); }
      hidePageLoader();
    }
  }

  async function handleAuthState(user) {
    if (!user) {
      stopCRMListeners(); state.profile = null; state.viewedAsPublic = false; showPublicSite(); return;
    }
    try {
      const snap = await state.db.collection('users').doc(user.uid).get();
      if (!snap.exists || snap.data().active === false) {
        await state.auth.signOut(); showPublicSite(); showLogin();
        $('#loginError').textContent = !snap.exists
          ? 'Профиль участника ещё не создан. Обратитесь к председателю для оформления доступа.'
          : 'Этот аккаунт отключён. Обратитесь к председателю Совета.';
        return;
      }
      const profileData = snap.data();
      const enforcedSector = forcedSectorId(profileData.role);
      if (enforcedSector && profileData.sectorId !== enforcedSector) {
        try {
          await state.db.collection('users').doc(user.uid).update({ sectorId: enforcedSector, updatedAt: timestamp() });
          profileData.sectorId = enforcedSector;
        } catch (sectorError) { console.warn('Could not normalize administrative sector:', sectorError); }
      }
      state.profile = { uid: user.uid, ...profileData, email: profileData.email || user.email || '' };
      state.profile.sectorId = forcedSectorId(state.profile.role) || state.profile.sectorId || '';
      state.viewedAsPublic = false;
      enterWorkspace(); startCRMListeners(); hideLogin();
    } catch (error) {
      console.error(error); await state.auth.signOut(); showPublicSite(); showLogin();
      $('#loginError').textContent = 'Не удалось загрузить профиль. Проверьте правила доступа Firestore.';
    }
  }

  function showPublicSite() {
    $('#publicShell').hidden = false; $('#workspace').hidden = true;
    document.body.classList.remove('workspace-active');
    state.viewedAsPublic = true;
    const authButton = $('#publicAuthButton');
    if (authButton) {
      if (state.profile && state.auth?.currentUser) {
        authButton.removeAttribute('data-open-login'); authButton.setAttribute('data-open-workspace', '');
        authButton.innerHTML = 'В рабочую CRM <span aria-hidden="true">↗</span>';
      } else {
        authButton.removeAttribute('data-open-workspace'); authButton.setAttribute('data-open-login', '');
        authButton.innerHTML = 'Личный кабинет <span aria-hidden="true">↗</span>';
      }
    }
  }
  function showWorkspace() {
    if (!state.profile || !state.auth?.currentUser) { showLogin(); return; }
    $('#publicShell').hidden = true; $('#workspace').hidden = false;
    document.body.classList.add('workspace-active'); state.viewedAsPublic = false;
    renderWorkspacePage(state.activePage || 'overview');
  }
  function enterWorkspace() {
    $('#publicShell').hidden = true; $('#workspace').hidden = false;
    document.body.classList.add('workspace-active');
    const name = profile().name || profile().displayName || 'Участник Совета';
    $('#userName').textContent = name; $('#userRole').textContent = roleLabel(role());
    $('#userAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'С';
    $$('[data-chair-only]').forEach(node => { node.hidden = !isChair(); });
    $$('[data-management-only]').forEach(node => { node.hidden = !canManageInitiatives(); });
    $$('[data-administrative-only]').forEach(node => { node.hidden = !isAdministrativeRole(); });
    renderWorkspacePage('overview');
  }

  function roleOptions(selected) {
    const options = [['member','Участник Совета'],['sector_lead','Руководитель сектора'],['administrative','Участник административного сектора'],['deputy_chair','Заместитель председателя'],['secretary','Секретарь Совета']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function sectorOptions(selected, includeUnassigned = false) {
    return `${includeUnassigned ? '<option value="">Не назначен</option>' : ''}${sectors.map(sector => `<option value="${sector.id}" ${selected === sector.id ? 'selected' : ''}>${sector.title}</option>`).join('')}`;
  }
  function syncRoleSector(roleSelect, sectorSelect) {
    if (!roleSelect || !sectorSelect) return;
    const forced = forcedSectorId(roleSelect.value);
    if (forced) { sectorSelect.value = forced; sectorSelect.disabled = true; return; }
    sectorSelect.disabled = false;
    if (roleSelect.value === 'sector_lead' && (!sectorSelect.value || sectorSelect.value === 'administrative')) sectorSelect.value = 'information';
  }
  function emptyState(icon, title, description) {
    return `<div class="workspace-empty"><span>${icon}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
  }
  function workspaceWelcome(kicker, title, description) {
    return `<div class="workspace-welcome"><div><p class="eyebrow">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div></div>`;
  }
  function workspacePanel(title, content, kicker = '') {
    return `<section class="workspace-panel">${kicker ? `<p class="eyebrow">${escapeHtml(kicker)}</p>` : ''}<h3>${escapeHtml(title)}</h3>${content}</section>`;
  }
  function recordEditForm(collection, id, fields, submitLabel = 'Сохранить изменения') {
    return `<details class="record-edit"><summary>Редактировать</summary><form class="crm-form-grid record-edit-form" data-edit-collection="${collection}" data-record-id="${escapeHtml(id)}">${fields}<div class="crm-form-actions"><button class="crm-primary" type="submit">${submitLabel}</button></div><p class="crm-form-message" role="status"></p></form></details>`;
  }
  function selectOptions(options, selected) { return Object.entries(options).map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join(''); }

  const workspacePages = {
    overview: 'Обзор CRM', initiatives: 'Инициативы и обращения', sector: 'Мой сектор', people: 'Участники',
    sectors: 'Управление секторами', meetings: 'Собрания', voting: 'Голосования', projects: 'Проекты',
    tasks: 'Задачи и решения', announcements: 'Объявления', documents: 'Документы', reports: 'Отчёты секторов',
    analytics: 'Аналитика', archive: 'Архив', account: 'Мой профиль', settings: 'Настройки аккаунта'
  };

  function renderOverview() {
    const myTasks = state.tasks.filter(item => item.assigneeUid === profile().uid && !['done','cancelled'].includes(item.status));
    const upcoming = state.meetings.filter(item => item.status !== 'cancelled' && item.date >= localDateISO()).sort((a,b) => String(a.date).localeCompare(String(b.date))).slice(0, 3);
    const openPolls = state.polls.filter(item => item.status === 'open');
    const quickTools = [['sector','◈','Мой сектор'],['meetings','◷','Собрания'],['voting','◉','Голосования'],['projects','◇','Проекты'],['tasks','✓','Задачи'],['documents','▧','Документы'],['archive','▧','Архив'],...(canManageInitiatives()?[['initiatives','✳','Инициативы'],['reports','▤','Отчёты']]:[]),...(isAdministrativeRole()?[['analytics','▥','Аналитика']]:[])];
    return `${workspaceWelcome('CRM / РАБОЧИЙ ЦЕНТР', `Здравствуйте, ${profile().name || 'участник'}.`, 'Рабочее пространство Совета: инициативы, собрания, проекты, голосования, поручения и документы.')}
      <div class="workspace-stat-grid"><article><span>МОЙ СЕКТОР</span><b>${escapeHtml(currentSector()?.title || 'Не назначен')}</b><small>Ваше направление деятельности</small></article><article><span>МОИ ЗАДАЧИ</span><b>${myTasks.length}</b><small>Активные поручения</small></article><article><span>ГОЛОСОВАНИЯ</span><b>${openPolls.length}</b><small>Открытые голосования</small></article><article><span>СОБРАНИЯ</span><b>${upcoming.length}</b><small>Ближайшие события</small></article></div>
      <div class="workspace-columns"><section class="workspace-panel"><div class="panel-heading"><div><p class="eyebrow">РАБОЧИЕ ИНСТРУМЕНТЫ</p><h3>Модули CRM</h3></div></div><div class="quick-grid">${quickTools.map(([id,icon,label]) => `<button type="button" data-go-page="${id}"><span>${icon}</span>${label}<b>↗</b></button>`).join('')}</div></section><section class="workspace-panel"><p class="eyebrow">ПРИНЦИПЫ СОВЕТА</p><h3>Вместе к результату</h3><ul class="principles-list"><li>Ответственность</li><li>Инициативность</li><li>Командная работа</li><li>Открытость</li><li>Равноправие</li></ul></section></div>
      <div class="workspace-columns"><section class="workspace-panel"><div class="panel-heading"><div><p class="eyebrow">ПЛАНИРОВАНИЕ</p><h3>Ближайшие собрания</h3></div><button class="crm-secondary" data-go-page="meetings">Все собрания</button></div>${upcoming.length ? `<ul class="detail-duty-list">${upcoming.map(item => `<li><b>${escapeHtml(item.title)}</b> — ${formatDate(item.date)} ${escapeHtml(item.time || '')}</li>`).join('')}</ul>` : emptyState('◷','Собраний пока нет','Когда административный сектор создаст собрание, оно появится здесь.')}</section><section class="workspace-panel"><div class="panel-heading"><div><p class="eyebrow">ВАШИ ПОРУЧЕНИЯ</p><h3>Активные задачи</h3></div><button class="crm-secondary" data-go-page="tasks">Все задачи</button></div>${myTasks.length ? `<ul class="detail-duty-list">${myTasks.slice(0,4).map(item => `<li><b>${escapeHtml(item.title)}</b> — до ${escapeHtml(item.dueDate || 'срок не указан')}</li>`).join('')}</ul>` : emptyState('✓','Нет активных задач','Новые поручения появятся в этом разделе.')}</section></div>`;
  }

  function initiativeTrackingUrl(id) { return trackingLink(id); }
  function renderInitiatives() {
    if (!canManageInitiatives()) return emptyState('♙','Нет доступа','Раздел обращений доступен административному сектору и руководителям секторов.');
    const items = state.initiatives;
    return `${workspaceWelcome('CRM / ВХОДЯЩИЕ', 'Инициативы учащихся', 'Каждое обращение имеет ID и публичную ссылку для проверки статуса. Административный сектор координирует обращения, руководители работают со своим направлением.')}
      <div class="workspace-toolbar"><span>${items.length} обращений</span><button class="crm-secondary" data-refresh-crm>Обновить</button></div>
      ${items.length ? items.map(item => {
        const canEdit = isAdministrativeRole() || (isSectorLead() && item.sectorId === currentSectorId());
        const url = initiativeTrackingUrl(item.id);
        return `<article class="crm-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))}</span><span class="crm-record-date">${escapeHtml(formatDate(item.createdAt))}</span></div><div class="initiative-id-line"><b>${escapeHtml(item.id)}</b><button type="button" class="text-button" data-copy-text="${escapeHtml(url)}">Копировать ссылку</button><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть отслеживание ↗</a></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="crm-record-meta"><span>Автор: ${escapeHtml(item.authorName || 'Не указано')}</span><span>Класс: ${escapeHtml(item.className || '—')}</span><span>Контакт: ${escapeHtml(item.contact || 'Не оставлен')}</span></div><div class="crm-record-controls"><label>Статус<select data-initiative-status="${escapeHtml(item.id)}" ${canEdit?'':'disabled'}>${Object.entries(INITIATIVE_STATUSES).map(([v,l])=>`<option value="${v}" ${item.status===v?'selected':''}>${l}</option>`).join('')}</select></label>${isAdministrativeRole()?`<label>Ответственный сектор<select data-initiative-sector="${escapeHtml(item.id)}">${sectors.map(s=>`<option value="${s.id}" ${item.sectorId===s.id?'selected':''}>${s.title}</option>`).join('')}</select></label>`:''}</div></article>`;
      }).join('') : emptyState('✳','Пока нет инициатив','Предложения, отправленные через публичную форму, будут отображаться здесь.')}`;
  }

  function renderPeople() {
    if (!isChair()) return emptyState('♙','Нет доступа','Управление участниками доступно председателю.');
    const rows = state.users.map(user => {
      const lockedChair = user.role === 'chair';
      const fixedSector = !!forcedSectorId(user.role);
      const sectorId = forcedSectorId(user.role) || user.sectorId || '';
      const roleControl = lockedChair ? `<b>${escapeHtml(roleLabel(user.role))}</b><small>Основная роль защищена</small>` : `<select class="person-role-select" data-person-role="${escapeHtml(user.uid)}">${roleOptions(user.role)}</select>`;
      const sectorControl = lockedChair ? `<b>Административный</b>` : `<select class="person-sector-select" data-person-sector="${escapeHtml(user.uid)}" ${fixedSector?'disabled':''}>${sectorOptions(sectorId, true)}</select>${fixedSector?'<small>Назначается автоматически</small>':''}`;
      const activeControl = lockedChair ? '<span class="crm-status">Всегда активен</span>' : `<select data-person-active="${escapeHtml(user.uid)}"><option value="true" ${user.active!==false?'selected':''}>Активен</option><option value="false" ${user.active===false?'selected':''}>Отключён</option></select>`;
      const publicControl = `<label class="checkbox-label person-public-toggle"><input type="checkbox" data-person-public="${escapeHtml(user.uid)}" ${user.showOnSite===true?'checked':''} ${user.active===false?'disabled':''}> Показывать на сайте</label>`;
      const action = `<button type="button" class="crm-secondary person-save-button" data-save-person="${escapeHtml(user.uid)}">Сохранить</button>`;
      return `<tr><td><b>${escapeHtml(user.name || 'Без имени')}</b><small>${escapeHtml(user.email || 'Email не указан')}</small></td><td>${roleControl}</td><td>${sectorControl}</td><td>${activeControl}</td><td>${publicControl}</td><td>${action}</td></tr>`;
    }).join('');
    return `${workspaceWelcome('CRM / КАДРЫ', 'Участники Совета', 'Председатель управляет составом, ролями, принадлежностью к секторам, доступом и публичным отображением команды.')}
      <section class="workspace-panel"><h3>Добавить участника в CRM</h3><p class="crm-hint"><b>Сначала создайте пользователя в Firebase Authentication.</b> Authentication → Users → Add user. Затем внесите UID. Пароль хранится только в Firebase Authentication.</p>
      <form id="participantForm" class="crm-form-grid"><label>UID из Firebase Authentication<input name="uid" required minlength="10" maxlength="150" placeholder="UID пользователя"></label><label>Электронная почта<input type="email" name="email" required maxlength="254" placeholder="name@example.com"></label><label>ФИО / имя<input name="name" required maxlength="100" placeholder="Имя и фамилия"></label><label>Роль<select name="role" id="newParticipantRole">${roleOptions('member')}</select></label><label>Сектор<select name="sectorId" id="newParticipantSector">${sectorOptions('', true)}</select></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Сохранить профиль</button></div><p class="crm-form-message" id="participantMessage" role="status"></p></form><p class="crm-hint">Председатель, заместители, секретарь и участники административного сектора закрепляются за административным сектором автоматически. Публикация участника на сайте включается отдельно.</p></section>
      <section class="workspace-panel"><div class="panel-heading"><h3>Список участников (${state.users.length})</h3><small>Роли изменяет председатель</small></div><div class="crm-table-wrap"><table class="crm-table people-table"><thead><tr><th>Участник / почта</th><th>Роль</th><th>Сектор</th><th>Доступ</th><th>Публично</th><th>Действие</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Пока нет профилей участников.</td></tr>'}</tbody></table></div></section>`;
  }

  function renderSectorsManagement() {
    if (!isAdministrativeRole()) return emptyState('▦','Нет доступа','Координация секторов доступна административному сектору.');
    return `${workspaceWelcome('CRM / ОРГАНИЗАЦИОННАЯ СТРУКТУРА','Управление секторами','Административный сектор координирует шесть направлений. Здесь можно смотреть состав команд и утверждать планы каждого сектора.')}
      <div class="crm-sector-grid">${sectors.map(sector=>{const members=state.users.filter(user=>(forcedSectorId(user.role)||user.sectorId)===sector.id);const lead=members.find(user=>user.role==='sector_lead');const plan=state.sectorPlans?.[sector.id]||{};return `<article class="crm-sector-card"><span>${sector.number} / 06</span><h3>${sector.title}</h3><p>${escapeHtml(sector.description)}</p><div class="crm-sector-foot"><b>${members.length} участников</b><small>${lead?`Руководитель: ${escapeHtml(lead.name||lead.email)}`:'Руководитель не назначен'}</small>${members.length?`<small>Команда: ${members.map(user=>escapeHtml(user.name||user.email||'Участник')).join(', ')}</small>`:''}</div><form class="crm-form-grid sector-plan-form" data-sector="${sector.id}"><label class="span-two">Цель сектора<input name="goal" maxlength="180" value="${escapeHtml(plan.goal||'')}"></label><label class="span-two">План работы<textarea name="plan" rows="4" maxlength="5000">${escapeHtml(plan.plan||'')}</textarea></label><label class="checkbox-label"><input type="checkbox" name="published" ${plan.published?'checked':''}> Публиковать план на сайте</label><div class="crm-form-actions"><button type="submit" class="crm-secondary">Сохранить план</button></div><p class="crm-form-message" role="status"></p></form></article>`}).join('')}</div>`;
  }

  function renderSector() {
    const sector = currentSector();
    if (!sector) return emptyState('✳','Сектор не назначен','Обратитесь к председателю Совета, чтобы указать направление деятельности.');
    const members = state.users.filter(user=>(forcedSectorId(user.role)||user.sectorId)===sector.id);
    const plan = state.sectorPlans?.[sector.id] || {};
    const canEdit = isAdministrativeRole() || (isSectorLead() && currentSectorId()===sector.id);
    return `${workspaceWelcome('МОЁ НАПРАВЛЕНИЕ',sector.title,sector.description)}
      ${workspacePanel('Обязанности сектора',`<ul class="detail-duty-list">${sector.duties.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      <section class="workspace-panel"><div class="panel-heading"><h3>Команда сектора</h3><small>${members.length} участников</small></div>${members.length?`<div class="team-mini-grid">${members.map(user=>`<div class="team-mini-card"><span>${escapeHtml((user.name||'У').trim().charAt(0).toUpperCase())}</span><div><b>${escapeHtml(user.name||'Участник')}</b><small>${escapeHtml(roleLabel(user.role))}</small></div></div>`).join('')}</div>`:emptyState('♙','Команда пока не сформирована','Председатель сможет назначить участников в разделе «Участники».')}</section>
      <section class="workspace-panel"><div class="panel-heading"><h3>Рабочий план сектора</h3>${canEdit?'<span class="crm-status">Можно редактировать</span>':''}</div>${canEdit?`<form id="sectorPlanForm" class="crm-form-grid" data-sector="${sector.id}"><label>Цель сектора<input name="goal" maxlength="180" value="${escapeHtml(plan.goal||'')}" placeholder="Главная цель на учебный год"></label><label>План работы<textarea name="plan" rows="7" maxlength="5000" placeholder="Пункты плана, мероприятия, ожидаемые результаты">${escapeHtml(plan.plan||'')}</textarea></label><label class="checkbox-label"><input type="checkbox" name="published" ${plan.published?'checked':''}> Показывать план публично</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Сохранить план</button></div><p class="crm-form-message" id="sectorPlanMessage" role="status"></p></form>`:`<div class="plan-reading"><b>${escapeHtml(plan.goal||'Цель ещё не определена')}</b><p>${escapeHtml(plan.plan||'Руководитель сектора ещё не добавил рабочий план.')}</p></div>`}</section>`;
  }

  function renderMeetings() {
    const form = canManageMeetings() ? `<section class="workspace-panel"><h3>Создать собрание</h3><form id="meetingForm" class="crm-form-grid"><label>Название<input name="title" required maxlength="140" placeholder="Например, Ежемесячное собрание Совета"></label><label>Дата<input type="date" name="date" required></label><label>Время<input type="time" name="time"></label><label>Место / формат<input name="location" maxlength="120" placeholder="Кабинет, актовый зал или онлайн"></label><label class="span-two">Повестка<textarea name="agenda" rows="4" maxlength="4000" placeholder="Вопросы к обсуждению"></textarea></label><label>Статус<select name="status"><option value="planned">Запланировано</option><option value="held">Проведено</option><option value="cancelled">Отменено</option></select></label><label class="checkbox-label"><input type="checkbox" name="published" checked> Показывать на публичной главной</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Создать собрание</button></div><p class="crm-form-message" id="meetingMessage" role="status"></p></form></section>` : '';
    const list = state.meetings.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    return `${workspaceWelcome('CRM / КАЛЕНДАРЬ','Собрания Совета','Административный сектор формирует повестку и организует собрания. Участники видят даты, время, место и материалы.')}${form}
      <section class="workspace-panel"><div class="panel-heading"><h3>Календарь и история (${list.length})</h3><button class="crm-secondary" data-refresh-crm>Обновить</button></div>${list.length?list.map(item=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(MEETING_STATUSES[item.status]||'Собрание')}</span><span class="crm-record-date">${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.time||'Время не указано')}</span></div><h3>${escapeHtml(item.title)}</h3><div class="crm-record-meta"><span>Место: ${escapeHtml(item.location||'Не указано')}</span><span>${item.published?'Публичное':'Внутреннее'}</span></div>${item.agenda?`<p>${escapeHtml(item.agenda)}</p>`:''}${canManageMeetings()?`${recordEditForm('meetings',item.id,`<label>Название<input name="title" required maxlength="140" value="${escapeHtml(item.title)}"></label><label>Дата<input type="date" name="date" required value="${escapeHtml(item.date||'')}"></label><label>Время<input type="time" name="time" value="${escapeHtml(item.time||'')}"></label><label>Место<input name="location" maxlength="120" value="${escapeHtml(item.location||'')}"></label><label class="span-two">Повестка<textarea name="agenda" rows="3" maxlength="4000">${escapeHtml(item.agenda||'')}</textarea></label><label class="checkbox-label"><input type="checkbox" name="published" ${item.published?'checked':''}> Публичное собрание</label>`)}<div class="crm-record-controls"><label>Статус<select data-meeting-status="${item.id}">${Object.entries(MEETING_STATUSES).map(([v,l])=>`<option value="${v}" ${item.status===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="crm-danger" data-delete-meeting="${item.id}">Удалить</button></div>`:''}</article>`).join(''):emptyState('◷','Собраний пока нет','Административный сектор может создать первое собрание выше.')}</section>`;
  }

  function votesFor(pollId) { return Object.values(state.votes[pollId] || {}); }
  function renderPollCard(poll) {
    const votes = votesFor(poll.id);
    const mine = state.votes[poll.id]?.[profile().uid];
    const pollDeadline = poll.endsAt?.toDate ? poll.endsAt.toDate() : (poll.endsAt ? new Date(poll.endsAt) : null);
    const canVote = poll.status === 'open' && (!pollDeadline || pollDeadline > new Date());
    const total = votes.length;
    const counts = (poll.options || []).map(option => ({...option, count:votes.filter(vote=>(vote.selectedOptionIds||[]).includes(option.id)).length}));
    const alreadyVoted = !!mine;
    return `<article class="crm-record poll-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(POLL_STATUSES[poll.status]||'Голосование')}</span><span class="crm-record-date">${total} голосов</span></div><h3>${escapeHtml(poll.title)}</h3>${poll.description?`<p>${escapeHtml(poll.description)}</p>`:''}
      ${canVote&&!alreadyVoted?`<form class="poll-vote-form" data-vote-poll="${poll.id}"><div class="poll-options">${(poll.options||[]).map(option=>`<label class="poll-option"><input type="${poll.type==='multiple'?'checkbox':'radio'}" name="optionIds" value="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span></label>`).join('')}</div><button class="crm-primary" type="submit">Проголосовать</button></form>`:alreadyVoted?'<p class="vote-confirmed">✓ Ваш голос учтён</p>':''}
      <div class="poll-results"><div class="poll-results-title"><b>Результаты</b><small>${total} участников проголосовали</small></div>${counts.map(option=>{const percent=total?Math.round(option.count/total*100):0;return `<div class="poll-result-row"><div><span>${escapeHtml(option.label)}</span><b>${option.count} · ${percent}%</b></div><div class="poll-bar"><i style="width:${percent}%"></i></div></div>`}).join('')}</div>
      ${canManagePolls()?`${recordEditForm('polls',poll.id,`<label>Вопрос<input name="title" required maxlength="180" value="${escapeHtml(poll.title)}"></label><label class="span-two">Описание<textarea name="description" rows="3" maxlength="1500">${escapeHtml(poll.description||'')}</textarea></label>`)}<div class="crm-record-controls"><label>Статус<select data-poll-status="${poll.id}"><option value="open" ${poll.status==='open'?'selected':''}>Открыто</option><option value="closed" ${poll.status==='closed'?'selected':''}>Завершено</option></select></label><button class="crm-danger" data-delete-poll="${poll.id}">Удалить</button></div>`:''}</article>`;
  }
  function renderVoting() {
    const form = canManagePolls()?`<section class="workspace-panel"><h3>Создать голосование</h3><form id="pollForm" class="crm-form-grid"><label>Вопрос<input name="title" required maxlength="180" placeholder="Формулировка голосования"></label><label>Тип<select name="type"><option value="single">Один вариант ответа</option><option value="multiple">Несколько вариантов ответа</option></select></label><label class="span-two">Описание / пояснение<textarea name="description" rows="3" maxlength="1500"></textarea></label><label class="span-two">Варианты ответа — каждый с новой строки<textarea name="options" required rows="5" placeholder="Вариант 1&#10;Вариант 2&#10;Вариант 3"></textarea></label><label>Окончание (необязательно)<input type="datetime-local" name="endsAt"></label><label class="checkbox-label"><input type="checkbox" name="published" checked> Показывать всем участникам</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Создать голосование</button></div><p class="crm-form-message" id="pollMessage" role="status"></p></form></section>`:'';
    return `${workspaceWelcome('CRM / ПРИНЯТИЕ РЕШЕНИЙ','Голосования','Участники Совета могут голосовать в открытых опросах. Создавать и закрывать голосования может административный сектор.')}${form}<section class="workspace-panel"><div class="panel-heading"><h3>Голосования (${state.polls.length})</h3><button class="crm-secondary" data-refresh-crm>Обновить</button></div>${state.polls.length?state.polls.map(renderPollCard).join(''):emptyState('◉','Голосований пока нет','Когда появится новый вопрос, он будет опубликован здесь.')}</section>`;
  }

  function renderProjects() {
    const canCreate = canManageProjects();
    const form = canCreate?`<section class="workspace-panel"><h3>Добавить проект</h3><form id="projectForm" class="crm-form-grid"><label>Название<input name="title" required maxlength="140"></label><label>Сектор<select name="sectorId" ${isSectorLead()?'disabled':''}>${sectorOptions(isSectorLead()?currentSectorId():'information')}</select></label><label class="span-two">Описание<textarea name="description" rows="4" maxlength="3000" required></textarea></label><label>Руководитель / ответственный<input name="leadName" maxlength="100" placeholder="Имя участника"></label><label>Статус<select name="status">${Object.entries(PROJECT_STATUSES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Дата начала<input type="date" name="startDate"></label><label>Срок / дата завершения<input type="date" name="endDate"></label><label class="checkbox-label"><input type="checkbox" name="published" checked> Публиковать на главной</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Добавить проект</button></div><p class="crm-form-message" id="projectMessage" role="status"></p></form></section>`:'';
    return `${workspaceWelcome('CRM / РЕАЛИЗАЦИЯ ИДЕЙ','Проекты Совета','От инициативы и планирования до реализации и отчёта. Каждый проект закрепляется за сектором.')}${form}<section class="workspace-panel"><div class="panel-heading"><h3>Список проектов (${state.projects.length})</h3></div>${state.projects.length?state.projects.map(item=>`<article class="crm-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))}</span><span class="crm-record-date">${escapeHtml(PROJECT_STATUSES[item.status]||'Проект')}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="crm-record-meta"><span>Ответственный: ${escapeHtml(item.leadName||'Не назначен')}</span><span>${escapeHtml(item.startDate||'—')} → ${escapeHtml(item.endDate||'—')}</span></div>${(isAdministrativeRole()||(isSectorLead()&&item.sectorId===currentSectorId()))?`${recordEditForm('projects',item.id,`<label>Название<input name="title" required maxlength="140" value="${escapeHtml(item.title)}"></label><label>Ответственный<input name="leadName" maxlength="100" value="${escapeHtml(item.leadName||'')}"></label><label class="span-two">Описание<textarea name="description" rows="3" maxlength="3000">${escapeHtml(item.description||'')}</textarea></label><label>Начало<input type="date" name="startDate" value="${escapeHtml(item.startDate||'')}"></label><label>Завершение<input type="date" name="endDate" value="${escapeHtml(item.endDate||'')}"></label><label class="checkbox-label"><input type="checkbox" name="published" ${item.published?'checked':''}> Публичный</label>`)}<div class="crm-record-controls"><label>Статус<select data-project-status="${item.id}">${Object.entries(PROJECT_STATUSES).map(([v,l])=>`<option value="${v}" ${item.status===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="crm-danger" data-delete-project="${item.id}">Удалить</button></div>`:''}</article>`).join(''):emptyState('◇','Проектов пока нет','Создайте первый проект или преобразуйте инициативу в проект.')}</section>`;
  }

  function renderTasks() {
    const isAdmin = isAdministrativeRole();
    const form = canManageTasks()?`<section class="workspace-panel"><h3>Создать задачу</h3><form id="taskForm" class="crm-form-grid"><label>Название поручения<input name="title" required maxlength="140"></label><label>Сектор<select name="sectorId" ${isSectorLead()?'disabled':''}>${sectorOptions(isSectorLead()?currentSectorId():'administrative')}</select></label><label class="span-two">Описание<textarea name="description" rows="3" maxlength="3000"></textarea></label><label>Ответственный${(isAdministrativeRole()||isSectorLead())?`<select name="assigneeUid"><option value="">Не назначен</option>${state.users.map(u=>`<option value="${u.uid}">${escapeHtml(u.name||u.email)}</option>`).join('')}</select>`:`<select name="assigneeUid"><option value="">Не назначен</option><option value="${profile().uid}" selected>Назначить мне</option></select>`}</label><label>Срок<input type="date" name="dueDate"></label><label>Приоритет<select name="priority"><option value="normal">Обычный</option><option value="high">Высокий</option><option value="low">Низкий</option></select></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Создать задачу</button></div><p class="crm-form-message" id="taskMessage" role="status"></p></form></section>`:'';
    const tasks = state.tasks.slice().sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
    return `${workspaceWelcome('CRM / ИСПОЛНЕНИЕ','Задачи и решения','Поручения распределяются по секторам и ответственным участникам. Исполнение фиксируется в единой системе.')}
      <div class="module-tabs"><button type="button" data-task-tab="tasks" class="${state.taskTab==='tasks'?'active':''}">Задачи (${tasks.length})</button><button type="button" data-task-tab="decisions" class="${state.taskTab==='decisions'?'active':''}">Решения (${state.decisions.length})</button></div>
      ${state.taskTab==='tasks'?`${form}<section class="workspace-panel"><div class="panel-heading"><h3>Поручения</h3></div>${tasks.length?tasks.map(task=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(task.sectorId))} · ${task.priority==='high'?'Высокий приоритет':task.priority==='low'?'Низкий приоритет':'Обычный приоритет'}</span><span class="crm-record-date">Срок: ${escapeHtml(task.dueDate||'не указан')}</span></div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description||'')}</p><div class="crm-record-meta"><span>Ответственный: ${escapeHtml(task.assigneeName||'Не назначен')}</span><span>Статус: ${escapeHtml(TASK_STATUSES[task.status]||'Новая')}</span></div>${(isAdministrativeRole()||(isSectorLead()&&task.sectorId===currentSectorId()))?recordEditForm('tasks',task.id,`<label>Название<input name="title" required maxlength="140" value="${escapeHtml(task.title)}"></label><label>Срок<input type="date" name="dueDate" value="${escapeHtml(task.dueDate||'')}"></label><label class="span-two">Описание<textarea name="description" rows="3" maxlength="3000">${escapeHtml(task.description||'')}</textarea></label><label>Приоритет<select name="priority">${selectOptions({low:'Низкий',normal:'Обычный',high:'Высокий'},task.priority||'normal')}</select></label><label>Ответственный<select name="assigneeUid"><option value="">Не назначен</option>${state.users.map(user=>`<option value="${user.uid}" ${task.assigneeUid===user.uid?'selected':''}>${escapeHtml(user.name||user.email)}</option>`).join('')}${task.assigneeUid&&!state.users.some(user=>user.uid===task.assigneeUid)?`<option value="${task.assigneeUid}" selected>${escapeHtml(task.assigneeName||'Текущий ответственный')}</option>`:''}</select></label>`):''}<div class="crm-record-controls"><label>Статус<select data-task-status="${task.id}" ${!(canManageTasks()||task.assigneeUid===profile().uid)?'disabled':''}>${Object.entries(TASK_STATUSES).map(([v,l])=>`<option value="${v}" ${task.status===v?'selected':''}>${l}</option>`).join('')}</select></label>${(isAdministrativeRole()||(isSectorLead()&&task.sectorId===currentSectorId()))?`<button class="crm-danger" data-delete-task="${task.id}">Удалить</button>`:''}</div></article>`).join(''):emptyState('✓','Задач пока нет','Председатель или руководитель сектора может создать поручение.')}</section>`:renderDecisionsSection()}`;
  }

  function renderDecisionsSection() {
    const form = isAdministrativeRole()?`<section class="workspace-panel"><h3>Зафиксировать решение</h3><form id="decisionForm" class="crm-form-grid"><label>Название решения<input name="title" required maxlength="160"></label><label>Ответственный сектор<select name="sectorId">${sectorOptions(currentSectorId()||'administrative')}</select></label><label class="span-two">Содержание / поручение<textarea name="description" required rows="4" maxlength="3000"></textarea></label><label>Статус<select name="status">${Object.entries(DECISION_STATUSES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Связанное собрание<input name="meetingTitle" maxlength="140" placeholder="Название собрания (необязательно)"></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Сохранить решение</button></div><p class="crm-form-message" id="decisionMessage" role="status"></p></form></section>`:'';
    return `${form}<section class="workspace-panel"><div class="panel-heading"><h3>Решения Совета</h3></div>${state.decisions.length?state.decisions.map(item=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))}</span><span class="crm-record-date">${escapeHtml(DECISION_STATUSES[item.status]||'Решение')}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>${item.meetingTitle?`<small>Собрание: ${escapeHtml(item.meetingTitle)}</small>`:''}${isAdministrativeRole()?`${recordEditForm('decisions',item.id,`<label>Название<input name="title" required maxlength="160" value="${escapeHtml(item.title)}"></label><label>Собрание<input name="meetingTitle" maxlength="140" value="${escapeHtml(item.meetingTitle||'')}"></label><label class="span-two">Содержание<textarea name="description" required rows="3" maxlength="3000">${escapeHtml(item.description)}</textarea></label>`)}<div class="crm-record-controls"><label>Статус<select data-decision-status="${item.id}">${Object.entries(DECISION_STATUSES).map(([v,l])=>`<option value="${v}" ${item.status===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="crm-danger" data-delete-decision="${item.id}">Удалить</button></div>`:''}</article>`).join(''):emptyState('☑','Решений пока нет','Принятые решения и поручения по итогам собраний появятся здесь.')}</section>`;
  }

  function renderAnnouncements() {
    const form = canManageAnnouncements()?`<section class="workspace-panel"><h3>Новое объявление</h3><form id="announcementForm" class="crm-form-grid"><label>Заголовок<input name="title" required maxlength="140"></label><label>Сектор<select name="sectorId" ${isSectorLead()?'disabled':''}>${sectorOptions(currentSectorId()||'information')}</select></label><label class="span-two">Текст объявления<textarea name="content" rows="5" required maxlength="5000"></textarea></label><label class="checkbox-label"><input type="checkbox" name="published" checked> Опубликовать на главной</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Опубликовать</button></div><p class="crm-form-message" id="announcementMessage" role="status"></p></form></section>`:'';
    return `${workspaceWelcome('CRM / ИНФОРМАЦИЯ','Объявления','Важная информация для участников Совета и учащихся. Публикации информационного сектора могут отображаться на публичной главной странице.')}${form}<section class="workspace-panel"><div class="panel-heading"><h3>Все объявления (${state.announcements.length})</h3></div>${state.announcements.length?state.announcements.map(item=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))}</span><span class="crm-record-date">${item.published?'Опубликовано':'Черновик'} · ${escapeHtml(formatDate(item.createdAt))}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p>${(isAdministrativeRole()||(isInformationSector()&&item.sectorId==='information'))?`${recordEditForm('announcements',item.id,`<label>Заголовок<input name="title" required maxlength="140" value="${escapeHtml(item.title)}"></label><label class="span-two">Текст<textarea name="content" required rows="4" maxlength="5000">${escapeHtml(item.content)}</textarea></label>`)}<div class="crm-record-controls"><label class="checkbox-label"><input type="checkbox" data-announcement-published="${item.id}" ${item.published?'checked':''}> Опубликовано</label><button class="crm-danger" data-delete-announcement="${item.id}">Удалить</button></div>`:''}</article>`).join(''):emptyState('▤','Объявлений пока нет','Создайте первую публикацию.')}</section>`;
  }

  function renderDocuments() {
    const form = canManageDocuments()?`<section class="workspace-panel"><h3>Добавить документ или материал</h3><form id="documentForm" class="crm-form-grid"><label>Название<input name="title" required maxlength="150"></label><label>Категория<input name="category" maxlength="60" placeholder="Положение, план, протокол, отчёт"></label><label class="span-two">Описание<textarea name="description" rows="3" maxlength="1600"></textarea></label><label class="span-two">Ссылка на документ (необязательно)<input type="url" name="url" maxlength="1000" placeholder="https://..."></label><label class="span-two">Текст материала (необязательно)<textarea name="content" rows="5" maxlength="12000" placeholder="Можно вставить текст протокола, плана или положения"></textarea></label><label class="checkbox-label"><input type="checkbox" name="published"> Публиковать для всех учащихся</label><div class="crm-form-actions"><button class="crm-primary" type="submit">Добавить материал</button></div><p class="crm-form-message" id="documentMessage" role="status"></p></form><p class="crm-hint">В этой версии хранятся ссылки и текстовые материалы. Загрузка файлов с компьютера потребует отдельного подключения Firebase Storage.</p></section>`:'';
    return `${workspaceWelcome('CRM / БИБЛИОТЕКА','Документы и материалы','Планы секторов, протоколы, положения, отчёты и другие материалы Совета.')}${form}<section class="workspace-panel"><div class="panel-heading"><h3>Библиотека (${state.documents.length})</h3></div>${state.documents.length?state.documents.map(item=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(item.category||'Материал')}</span><span class="crm-record-date">${item.published?'Публичный':'Внутренний'} · ${escapeHtml(formatDate(item.createdAt))}</span></div><h3>${escapeHtml(item.title)}</h3>${item.description?`<p>${escapeHtml(item.description)}</p>`:''}${item.content?`<details class="document-content"><summary>Открыть текст материала</summary><p>${escapeHtml(item.content)}</p></details>`:''}${item.url?`<a class="text-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Открыть документ ↗</a>`:''}${(isAdministrativeRole()||(isSectorLead()&&item.sectorId===currentSectorId()))?`${recordEditForm('documents',item.id,`<label>Название<input name="title" required maxlength="150" value="${escapeHtml(item.title)}"></label><label>Категория<input name="category" maxlength="60" value="${escapeHtml(item.category||'')}"></label><label class="span-two">Описание<textarea name="description" rows="2" maxlength="1600">${escapeHtml(item.description||'')}</textarea></label><label class="span-two">Ссылка<input type="url" name="url" maxlength="1000" value="${escapeHtml(item.url||'')}"></label><label class="span-two">Текст<textarea name="content" rows="4" maxlength="12000">${escapeHtml(item.content||'')}</textarea></label>`)}<div class="crm-record-controls"><label class="checkbox-label"><input type="checkbox" data-document-published="${item.id}" ${item.published?'checked':''}> Публичный</label><button class="crm-danger" data-delete-document="${item.id}">Удалить</button></div>`:''}</article>`).join(''):emptyState('▧','Библиотека пока пуста','Добавьте первый документ или текстовый материал.')}</section>`;
  }

  function renderReports() {
    const canSubmit = isSectorLead();
    const form = canSubmit ? `<section class="workspace-panel"><h3>Сдать отчёт сектора</h3><form id="sectorReportForm" class="crm-form-grid"><label>Отчётный период<input type="month" name="period" required></label><label>Название отчёта<input name="title" required maxlength="140" placeholder="Например, Итоги ноября"></label><label class="span-two">Краткий итог работы<textarea name="summary" required rows="3" maxlength="1800"></textarea></label><label class="span-two">Выполненные задачи и мероприятия<textarea name="achievements" rows="4" maxlength="3000"></textarea></label><label class="span-two">Сложности и нерешённые вопросы<textarea name="problems" rows="3" maxlength="2000"></textarea></label><label class="span-two">Планы на следующий период<textarea name="nextSteps" rows="3" maxlength="2000"></textarea></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Отправить отчёт</button></div><p class="crm-form-message" id="sectorReportMessage" role="status"></p></form></section>` : '';
    const items = state.reports.slice().sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
    return `${workspaceWelcome('CRM / ОТЧЁТНОСТЬ','Отчёты секторов','Руководители направлений ежемесячно представляют результаты административному сектору. Административный сектор принимает отчёт или возвращает его на доработку.')}${form}<section class="workspace-panel"><div class="panel-heading"><h3>Отчёты (${items.length})</h3><small>${isAdministrativeRole()?'Просмотр всех направлений':'Отчётность вашего сектора'}</small></div>${items.length?items.map(item=>`<article class="crm-record compact-record"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))} · ${escapeHtml(item.period||'Период не указан')}</span><span class="crm-status ${item.status==='revision'?'inactive':''}">${item.status==='accepted'?'Принят':item.status==='revision'?'На доработке':'На проверке'}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary||'')}</p>${item.achievements?`<details><summary>Выполнено</summary><p>${escapeHtml(item.achievements)}</p></details>`:''}${item.problems?`<details><summary>Сложности</summary><p>${escapeHtml(item.problems)}</p></details>`:''}${item.nextSteps?`<details><summary>Дальнейшие планы</summary><p>${escapeHtml(item.nextSteps)}</p></details>`:''}${item.reviewNote?`<p class="crm-hint"><b>Комментарий административного сектора:</b> ${escapeHtml(item.reviewNote)}</p>`:''}${isAdministrativeRole()?`<div class="crm-record-controls"><label>Решение по отчёту<select data-report-status="${item.id}"><option value="submitted" ${item.status==='submitted'?'selected':''}>На проверке</option><option value="accepted" ${item.status==='accepted'?'selected':''}>Принять</option><option value="revision" ${item.status==='revision'?'selected':''}>На доработку</option></select></label><label>Комментарий<textarea data-report-note="${item.id}" rows=2 maxlength=600>${escapeHtml(item.reviewNote||'')}</textarea></label><button type="button" class="crm-secondary" data-save-report-note="${item.id}">Сохранить комментарий</button></div>`:''}${isSectorLead()&&item.status==='revision'&&item.createdBy===profile().uid?recordEditForm('sectorReports',item.id,`<label class="span-two">Краткий итог<textarea name="summary" required rows=3 maxlength=1800>${escapeHtml(item.summary||'')}</textarea></label><label class="span-two">Выполненные задачи<textarea name="achievements" rows=3 maxlength=3000>${escapeHtml(item.achievements||'')}</textarea></label><label class="span-two">Сложности<textarea name="problems" rows=3 maxlength=2000>${escapeHtml(item.problems||'')}</textarea></label><label class="span-two">Дальнейшие планы<textarea name="nextSteps" rows=3 maxlength=2000>${escapeHtml(item.nextSteps||'')}</textarea></label>`,'Отправить повторно'):''}</article>`).join(''):emptyState('▤','Отчётов пока нет','После первого месяца работы руководители секторов смогут отправить сюда отчёт.')}</section>`;
  }

  function renderAnalytics() {
    if(!isAdministrativeRole()) return emptyState('▥','Нет доступа','Аналитика доступна административному сектору.');
    const totalVotes = Object.values(state.votes).reduce((sum, ballotMap)=>sum+Object.keys(ballotMap).length,0);
    const counts = sectors.map(sector=>({sector,count:state.initiatives.filter(item=>item.sectorId===sector.id).length}));
    const maxCount = Math.max(1,...counts.map(item=>item.count));
    const activeTasks = state.tasks.filter(item=>!['done','cancelled'].includes(item.status)).length;
    const finishedProjects = state.projects.filter(item=>item.status==='completed').length;
    const completedInitiatives = state.initiatives.filter(item=>item.status==='done').length;
    const submittedReports = state.reports.filter(item=>item.status==='submitted').length;
    return `${workspaceWelcome('CRM / ПОКАЗАТЕЛИ','Аналитика работы Совета','Сводная картина по обращениям, задачам, проектам, голосованиям и отчётности.')}
      <div class="workspace-stat-grid"><article><span>ОБРАЩЕНИЯ</span><b>${state.initiatives.length}</b><small>${completedInitiatives} реализовано</small></article><article><span>АКТИВНЫЕ ЗАДАЧИ</span><b>${activeTasks}</b><small>Поручения не завершены</small></article><article><span>ПРОЕКТЫ</span><b>${state.projects.length}</b><small>${finishedProjects} завершено</small></article><article><span>ГОЛОСА</span><b>${totalVotes}</b><small>Во всех загруженных голосованиях</small></article><article><span>СОБРАНИЯ</span><b>${state.meetings.length}</b><small>Включая историю</small></article><article><span>ОТЧЁТЫ НА ПРОВЕРКЕ</span><b>${submittedReports}</b><small>Ожидают решения</small></article></div>
      <section class="workspace-panel"><h3>Обращения по секторам</h3>${counts.map(item=>`<div class="analytics-row"><div><span>${escapeHtml(item.sector.title)}</span><b>${item.count}</b></div><div class="poll-bar"><i style="width:${Math.round(item.count/maxCount*100)}%"></i></div></div>`).join('')}</section>
      <section class="workspace-panel"><h3>Состояние работы</h3><div class="crm-record-meta"><span>Открытые голосования: ${state.polls.filter(item=>item.status==='open').length}</span><span>Решения в исполнении: ${state.decisions.filter(item=>item.status==='in_progress').length}</span><span>Завершённые задачи: ${state.tasks.filter(item=>item.status==='done').length}</span></div></section>`;
  }

  function renderArchive() {
    const archived = [
      ...state.meetings.filter(item=>['held','cancelled'].includes(item.status)).map(item=>({kind:'Собрание',title:item.title,detail:`${formatDate(item.date)} · ${MEETING_STATUSES[item.status]}`})),
      ...state.polls.filter(item=>item.status==='closed').map(item=>({kind:'Голосование',title:item.title,detail:`${votesFor(item.id).length} голосов · Завершено`})),
      ...state.tasks.filter(item=>['done','cancelled'].includes(item.status)).map(item=>({kind:'Задача',title:item.title,detail:`${TASK_STATUSES[item.status]} · ${sectorName(item.sectorId)}`})),
      ...state.decisions.filter(item=>['done','rejected'].includes(item.status)).map(item=>({kind:'Решение',title:item.title,detail:DECISION_STATUSES[item.status]})),
      ...state.projects.filter(item=>['completed','paused'].includes(item.status)).map(item=>({kind:'Проект',title:item.title,detail:PROJECT_STATUSES[item.status]})),
      ...state.initiatives.filter(item=>['done','rejected'].includes(item.status)).map(item=>({kind:'Обращение',title:item.title,detail:`${item.id} · ${statusText(item.status)}`})),
      ...state.reports.filter(item=>item.status==='accepted').map(item=>({kind:'Отчёт сектора',title:item.title,detail:`${sectorName(item.sectorId)} · ${item.period||''}`}))
    ];
    return `${workspaceWelcome('CRM / ИСТОРИЯ','Архив Совета','Завершённые и отменённые собрания, голосования, поручения, решения, проекты и обращения.')}${archived.length?`<section class="workspace-panel"><div class="panel-heading"><h3>Архивные записи (${archived.length})</h3></div>${archived.map(item=>`<article class="archive-row"><span>${escapeHtml(item.kind)}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></div></article>`).join('')}</section>`:emptyState('▧','Архив пока пуст','Завершённые записи автоматически появятся здесь.')}`;
  }

  function renderSettings() {
    return `${workspaceWelcome('АККАУНТ / БЕЗОПАСНОСТЬ','Настройки аккаунта','Изменение пароля выполняется непосредственно через Firebase Authentication. Новый пароль не сохраняется в Firestore.')}
      <section class="workspace-panel"><h3>Сменить пароль</h3><form id="settingsForm" class="crm-form-grid"><label class="span-two">Текущий пароль<input type="password" name="currentPassword" autocomplete="current-password" required></label><label>Новый пароль<input type="password" name="newPassword" autocomplete="new-password" minlength="8" required></label><label>Повторите новый пароль<input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Обновить пароль</button></div><p class="crm-form-message" id="settingsMessage" role="status"></p></form></section>`;
  }

  function renderAccount() {
    const sector = currentSector();
    return `${workspaceWelcome('МОИ ДАННЫЕ','Профиль участника','Здесь можно обновить имя и контактные данные. Роль и сектор назначает председатель.')}
      <section class="workspace-panel account-panel"><form id="accountForm" class="crm-form-grid"><label>Имя<input name="name" required maxlength="100" value="${escapeHtml(profile().name||'')}"></label><label>Контактный номер<input name="contact" maxlength="80" value="${escapeHtml(profile().contact||'')}" placeholder="Необязательно"></label><label>Электронная почта<input value="${escapeHtml(profile().email||state.auth?.currentUser?.email||'')}" disabled></label><label>Роль<input value="${escapeHtml(roleLabel(role()))}" disabled></label><label>Сектор<input value="${escapeHtml(sector?.title||'Не назначен')}" disabled></label><label>Статус<input value="${profile().active===false?'Отключён':'Активен'}" disabled></label><div class="crm-form-actions"><button class="crm-primary" type="submit">Сохранить профиль</button></div><p class="crm-form-message" id="accountMessage" role="status"></p></form></section>`;
  }

  function renderWorkspacePage(page) {
    if (!workspacePages[page]) page='overview';
    if (page==='people'&&!isChair()) page='overview';
    if (page==='sectors'&&!isAdministrativeRole()) page='overview';
    if (page==='reports'&&!(isAdministrativeRole()||isSectorLead())) page='overview';
    if (page==='analytics'&&!isAdministrativeRole()) page='overview';
    if (page==='initiatives'&&!canManageInitiatives()) page='overview';
    if (page==='meetings'&&!state.profile) page='overview';
    state.activePage=page;
    $('#workspaceTitle').textContent=workspacePages[page];
    $$('.workspace-nav [data-workpage]').forEach(button=>button.classList.toggle('active',button.dataset.workpage===page));
    const content=$('#workspaceContent');
    if (page==='overview') content.innerHTML=renderOverview();
    else if (page==='initiatives') content.innerHTML=renderInitiatives();
    else if (page==='people') content.innerHTML=renderPeople();
    else if (page==='sectors') content.innerHTML=renderSectorsManagement();
    else if (page==='sector') content.innerHTML=renderSector();
    else if (page==='meetings') content.innerHTML=renderMeetings();
    else if (page==='voting') content.innerHTML=renderVoting();
    else if (page==='projects') content.innerHTML=renderProjects();
    else if (page==='tasks') content.innerHTML=renderTasks();
    else if (page==='announcements') content.innerHTML=renderAnnouncements();
    else if (page==='documents') content.innerHTML=renderDocuments();
    else if (page==='reports') content.innerHTML=renderReports();
    else if (page==='analytics') content.innerHTML=renderAnalytics();
    else if (page==='archive') content.innerHTML=renderArchive();
    else if (page==='account') content.innerHTML=renderAccount();
    else if (page==='settings') content.innerHTML=renderSettings();
  }

  function addListener(unsubscribe) { state.listeners.push(unsubscribe); }
  function mapSnapshot(snapshot) { return snapshot.docs.map(doc=>({id:doc.id,...doc.data()})); }
  function sortNewest(items) { return items.slice().sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)); }
  function renderIfPage(...pages) { if (pages.includes(state.activePage) && !state.viewedAsPublic) renderWorkspacePage(state.activePage); }

  function startPublicListeners() {
    if (!state.db || state.publicListeners.length) return;
    const attach=(collection, target, renderer)=>{
      state.publicListeners.push(state.db.collection(collection).where('published','==',true).limit(20).onSnapshot(snapshot=>{
        state[target]=sortNewest(mapSnapshot(snapshot)).slice(0,8); renderer();
      },error=>console.warn(`Public ${collection} feed:`,error)));
    };
    attach('announcements','publicAnnouncements',renderPublicNews);
    attach('meetings','publicMeetings',renderPublicEvents);
    attach('projects','publicProjects',renderPublicProjects);
    attach('documents','publicDocuments',renderPublicDocuments);
    attach('sectorPlans','publicSectorPlans',renderPublicSectorPlans);
    attach('publicTeam','publicTeam',renderPublicTeam);
  }
  function stopPublicListeners() { state.publicListeners.forEach(unsubscribe=>{try{unsubscribe()}catch(_){}});state.publicListeners=[]; }

  function renderPublicNews() {
    const node=$('#publicNews'); if(!node)return;
    node.innerHTML=state.publicAnnouncements.length?state.publicAnnouncements.map(item=>`<article class="public-feed-card"><p class="eyebrow">${escapeHtml(sectorName(item.sectorId))} · ${escapeHtml(formatDate(item.createdAt))}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></article>`).join(''):`<div class="empty-feature"><div class="empty-feature-icon">✳</div><div><h3>Пока нет опубликованных новостей</h3><p>Материалы появятся здесь после публикации информационным или административным сектором.</p></div></div>`;
  }
  function renderPublicEvents() {
    const node=$('#publicEvents'); if(!node)return;
    node.innerHTML=state.publicMeetings.length?state.publicMeetings.slice(0,5).map(item=>`<article class="public-event-card"><span>${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.time||'')}</span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.location||'Место уточняется')}</small></article>`).join(''):`<span class="event-placeholder-icon">◷</span><b>Календарь событий</b><small>Опубликованные собрания появятся здесь</small>`;
  }
  function renderPublicProjects() {
    const node=$('#publicProjects'); if(!node)return;
    node.innerHTML=state.publicProjects.length?state.publicProjects.map(item=>`<article class="public-feed-card"><p class="eyebrow">${escapeHtml(sectorName(item.sectorId))} · ${escapeHtml(PROJECT_STATUSES[item.status]||'Проект')}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join(''):`<div class="project-strip"><span class="project-number">01</span><div><b>Идея</b><small>Предложение и обсуждение направления</small></div><span class="project-arrow">→</span><span class="project-number">02</span><div><b>План</b><small>Команда, задачи и сроки</small></div><span class="project-arrow">→</span><span class="project-number">03</span><div><b>Результат</b><small>Реализация и отчёт</small></div></div>`;
  }
  function renderPublicDocuments() {
    const node=$('#publicDocuments'); if(!node)return;
    node.innerHTML=state.publicDocuments.length?state.publicDocuments.map(item=>`<article class="public-document-card"><span>▧</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category||'Материал')} · ${escapeHtml(item.description||'')}</small>${item.url?`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Открыть документ ↗</a>`:''}${item.content?`<details><summary>Читать текст</summary><p>${escapeHtml(item.content)}</p></details>`:''}</div></article>`).join(''):`<div class="materials-placeholder"><span>▧</span><div><b>Библиотека документов</b><small>Опубликованные материалы появятся здесь.</small></div></div>`;
  }
  function renderPublicSectorPlans() {
    const node=$('#publicSectorPlans'); if(!node)return;
    const plans=sectors.map(sector=>({sector,...state.publicSectorPlans.find(item=>item.sectorId===sector.id)||{}})).filter(item=>item.goal||item.plan);
    node.innerHTML=plans.length?plans.map(item=>`<article class="public-plan-card"><p class="eyebrow">${escapeHtml(item.sector.title)} · ПЛАН РАБОТЫ</p>${item.goal?`<h3>${escapeHtml(item.goal)}</h3>`:''}${item.plan?`<p>${escapeHtml(item.plan)}</p>`:''}</article>`).join(''):`<div class="empty-feature"><div class="empty-feature-icon">▦</div><div><h3>Планы секторов готовятся</h3><p>Здесь появятся планы, которые административный сектор и руководители направлений откроют для публикации.</p></div></div>`;
  }
  function renderPublicTeam() {
    const node=$('#publicTeamGrid'); if(!node)return;
    const visible=state.publicTeam.slice().sort((a,b)=>sectors.findIndex(item=>item.id===a.sectorId)-sectors.findIndex(item=>item.id===b.sectorId));
    node.innerHTML=visible.length?visible.map(person=>`<article class="public-team-card"><span class="public-team-avatar">${escapeHtml((person.name||'У').trim().charAt(0).toUpperCase())}</span><div><b>${escapeHtml(person.name||'Участник Совета')}</b><small>${escapeHtml(roleLabel(person.role))}</small><span>${escapeHtml(sectorName(person.sectorId))}</span></div></article>`).join(''):`<div class="empty-feature"><div class="empty-feature-icon">♙</div><div><h3>Состав Совета формируется</h3><p>Председатель сможет опубликовать участников после утверждения состава и согласования публичного представления.</p></div><span class="empty-tag">СОСТАВ ФОРМИРУЕТСЯ</span></div>`;
  }

  function startCRMListeners() {
    stopCRMListeners();
    if(!state.db||!state.profile)return;
    const db=state.db;
    if(canManageInitiatives()){
      const ref=isSectorLead()?db.collection('initiatives').where('sectorId','==',currentSectorId()):db.collection('initiatives');
      addListener(ref.onSnapshot(snapshot=>{state.initiatives=sortNewest(mapSnapshot(snapshot));renderIfPage('overview','initiatives','analytics','archive');},err=>console.warn('Initiatives:',err)));
    }
    addListener(db.collection('meetings').orderBy('date','desc').limit(100).onSnapshot(snapshot=>{state.meetings=mapSnapshot(snapshot);renderIfPage('overview','meetings','analytics','archive');},err=>console.warn('Meetings:',err)));
    addListener(db.collection('polls').orderBy('createdAt','desc').limit(100).onSnapshot(snapshot=>{state.polls=mapSnapshot(snapshot);syncVoteListeners();renderIfPage('overview','voting','analytics','archive');},err=>console.warn('Polls:',err)));
    addListener(db.collection('decisions').orderBy('createdAt','desc').limit(100).onSnapshot(snapshot=>{state.decisions=mapSnapshot(snapshot);renderIfPage('tasks','analytics','archive');},err=>console.warn('Decisions:',err)));
    addListener(db.collection('announcements').orderBy('createdAt','desc').limit(100).onSnapshot(snapshot=>{state.announcements=mapSnapshot(snapshot);renderIfPage('announcements');},err=>console.warn('Announcements:',err)));
    addListener(db.collection('documents').orderBy('createdAt','desc').limit(100).onSnapshot(snapshot=>{state.documents=mapSnapshot(snapshot);renderIfPage('documents');},err=>console.warn('Documents:',err)));
    addListener(db.collection('projects').orderBy('createdAt','desc').limit(100).onSnapshot(snapshot=>{state.projects=mapSnapshot(snapshot);renderIfPage('projects','analytics','archive');},err=>console.warn('Projects:',err)));
    if(isAdministrativeRole()) addListener(db.collection('users').onSnapshot(snapshot=>{
      state.users=mapSnapshot(snapshot).map(user=>({...user,uid:user.id,sectorId:forcedSectorId(user.role)||user.sectorId||''}));
      renderIfPage('people','sectors','sector','tasks','reports');
    },err=>console.warn('Users:',err)));
    else if(currentSectorId()) addListener(db.collection('users').where('sectorId','==',currentSectorId()).onSnapshot(snapshot=>{
      state.users=mapSnapshot(snapshot).map(user=>({...user,uid:user.id,sectorId:forcedSectorId(user.role)||user.sectorId||''}));
      renderIfPage('sector','tasks');
    },err=>console.warn('Sector users:',err)));
    if(isAdministrativeRole()) addListener(db.collection('tasks').orderBy('createdAt','desc').limit(200).onSnapshot(snapshot=>{state.tasks=mapSnapshot(snapshot);renderIfPage('overview','tasks','analytics','archive');},err=>console.warn('Tasks:',err)));
    else {
      const taskSources=[new Map(),new Map()];
      const updateTasks=(index,snapshot)=>{taskSources[index].clear();snapshot.docs.forEach(doc=>taskSources[index].set(doc.id,{id:doc.id,...doc.data()}));state.tasks=[...new Map([...taskSources[0],...taskSources[1]]).values()];renderIfPage('overview','tasks','analytics','archive');};
      if(currentSectorId()) addListener(db.collection('tasks').where('sectorId','==',currentSectorId()).limit(200).onSnapshot(snapshot=>updateTasks(0,snapshot),err=>console.warn('Sector tasks:',err)));
      addListener(db.collection('tasks').where('assigneeUid','==',profile().uid).limit(200).onSnapshot(snapshot=>updateTasks(1,snapshot),err=>console.warn('Assigned tasks:',err)));
    }
    addListener(db.collection('sectorPlans').doc(currentSectorId()||'__none__').onSnapshot(snapshot=>{state.sectorPlan=snapshot.exists?snapshot.data():null;state.sectorPlans=state.sectorPlans||{};if(snapshot.exists)state.sectorPlans[currentSectorId()]=snapshot.data();renderIfPage('sector','sectors');},err=>console.warn('Sector plan:',err)));
    if(isAdministrativeRole()) addListener(db.collection('sectorPlans').onSnapshot(snapshot=>{state.sectorPlans={};snapshot.docs.forEach(doc=>state.sectorPlans[doc.id]=doc.data());renderIfPage('sectors');},err=>console.warn('Sector plans:',err)));
    if(isAdministrativeRole()) addListener(db.collection('sectorReports').orderBy('createdAt','desc').limit(200).onSnapshot(snapshot=>{state.reports=mapSnapshot(snapshot);renderIfPage('reports','analytics','archive');},err=>console.warn('Sector reports:',err)));
    else if(isSectorLead()) addListener(db.collection('sectorReports').where('sectorId','==',currentSectorId()).limit(100).onSnapshot(snapshot=>{state.reports=mapSnapshot(snapshot);renderIfPage('reports','archive');},err=>console.warn('Sector reports:',err)));
    addListener(db.collection('activityFeed').orderBy('createdAt','desc').limit(30).onSnapshot(snapshot=>{
      const changes=snapshot.docChanges();
      if(state.feedInitialized){changes.filter(change=>change.type==='added').forEach(change=>notifyActivity(change.doc.data()));}
      state.feed=mapSnapshot(snapshot);state.feedInitialized=true;renderNotificationPanel();
    },err=>console.warn('Activity feed:',err)));
  }

  function syncVoteListeners() {
    const activeIds=new Set(state.polls.map(poll=>poll.id));
    for(const [id,unsubscribe] of state.voteUnsubs.entries()) if(!activeIds.has(id)){unsubscribe();state.voteUnsubs.delete(id);delete state.votes[id];}
    for(const poll of state.polls){
      if(state.voteUnsubs.has(poll.id))continue;
      const unsub=state.db.collection('polls').doc(poll.id).collection('votes').onSnapshot(snapshot=>{
        state.votes[poll.id]={};snapshot.docs.forEach(doc=>state.votes[poll.id][doc.id]=doc.data());renderIfPage('voting');
      },error=>console.warn('Poll votes:',error));
      state.voteUnsubs.set(poll.id,unsub);
    }
  }

  function stopCRMListeners() {
    state.listeners.forEach(unsubscribe=>{try{unsubscribe()}catch(_){}});state.listeners=[];
    for(const unsubscribe of state.voteUnsubs.values()){try{unsubscribe()}catch(_){}}state.voteUnsubs.clear();
    state.feedInitialized=false;state.initiatives=[];state.users=[];state.meetings=[];state.polls=[];state.votes={};state.tasks=[];state.decisions=[];state.announcements=[];state.documents=[];state.projects=[];state.reports=[];state.sectorPlans={};state.feed=[];
  }

  function showToast(title, description, type='info') {
    const region=$('#toastRegion');if(!region)return;
    const toast=document.createElement('div');toast.className=`toast toast-${type}`;
    toast.innerHTML=`<span class="toast-icon">${type==='initiative'?'✳':type==='meeting'?'◷':type==='poll'?'◉':'•'}</span><div><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></div><button type="button" aria-label="Закрыть">×</button>`;
    region.appendChild(toast);toast.querySelector('button').addEventListener('click',()=>toast.remove());
    window.setTimeout(()=>toast.remove(),8500);
  }
  function activityTypeLabel(type){return({initiative:'Новая инициатива',meeting:'Новое собрание',poll:'Новое голосование'})[type]||'Новое событие';}
  function notifyActivity(data){
    const descriptions={initiative:'Поступило новое обращение от учащегося.',meeting:'В календаре появилось новое собрание.',poll:'Опубликовано новое голосование.'};
    showToast(data.title||activityTypeLabel(data.type),descriptions[data.type]||'В CRM появилось новое событие.',data.type||'info');
  }
  function renderNotificationPanel(){
    const panel=$('#notificationPanel');if(!panel)return;
    const notificationTotal=state.feed.length;
    const badge=$('#notificationCount');if(badge){badge.textContent=String(Math.min(notificationTotal,99));badge.hidden=notificationTotal===0;}
    panel.innerHTML=`<div class="notification-panel-head"><b>События Совета</b><small>${state.feed.length} последних</small></div>${state.feed.length?state.feed.map(item=>`<article class="notification-item"><span>${item.type==='initiative'?'✳':item.type==='meeting'?'◷':'◉'}</span><div><b>${escapeHtml(item.title||activityTypeLabel(item.type))}</b><small>${escapeHtml(activityTypeLabel(item.type))} · ${escapeHtml(formatDateTime(item.createdAt))}</small>${item.type==='initiative'?`<button type="button" data-open-initiative-record="${escapeHtml(item.recordId||'')}">Открыть обращение</button>`:item.type==='meeting'?`<button type="button" data-go-page="meetings">Открыть собрания</button>`:`<button type="button" data-go-page="voting">Открыть голосования</button>`}</div></article>`).join(''):'<p class="notification-empty">Пока новых событий нет.</p>'}`;
  }

  async function submitLogin(event){
    event.preventDefault();const email=normalizeEmail($('#loginEmail').value),password=$('#loginPassword').value,error=$('#loginError'),button=$('.login-submit',$('#loginForm'));
    error.textContent='';if(!validEmail(email)){error.textContent='Введите действительный адрес электронной почты.';return;}if(!password){error.textContent='Введите пароль.';return;}if(!state.auth){error.textContent='Firebase Authentication пока не подключён.';return;}
    button.disabled=true;button.textContent='Выполняется вход…';
    try{await state.auth.signInWithEmailAndPassword(email,password);}catch(err){console.error(err);const messages={'auth/invalid-credential':'Неверная электронная почта или пароль.','auth/wrong-password':'Неверная электронная почта или пароль.','auth/user-not-found':'Аккаунт не найден. Обратитесь к председателю Совета.','auth/invalid-email':'Проверьте формат электронной почты.','auth/user-disabled':'Этот аккаунт отключён. Обратитесь к председателю.','auth/too-many-requests':'Слишком много попыток. Попробуйте позже.','auth/operation-not-allowed':'В Firebase Console включите Authentication → Email/Password.','auth/network-request-failed':'Нет соединения. Проверьте интернет.'};error.textContent=messages[err.code]||'Не удалось войти. Проверьте почту, пароль и настройки Firebase.';}finally{button.disabled=false;button.innerHTML='Войти в систему <span>→</span>';}
  }

  async function submitPublicInitiative(event){
    event.preventDefault();const form=$('#initiativeForm'),button=$('#initiativeSubmit'),error=$('#initiativeError');error.textContent='';
    if(!state.db){error.textContent='Форма пока недоступна: нет соединения с Firebase.';return;}
    const data=Object.fromEntries(new FormData(form).entries()),title=String(data.title||'').trim(),description=String(data.description||'').trim();
    if(title.length<4||description.length<10||!sectors.some(item=>item.id===data.sectorId)){error.textContent='Проверьте название, описание и выбранное направление.';return;}
    button.disabled=true;button.textContent='Отправляем…';
    try{
      const id=generateTrackingId();const initiativeRef=state.db.collection('initiatives').doc(id),trackingRef=state.db.collection('initiativeTracking').doc(id),feedRef=state.db.collection('activityFeed').doc();
      const createdAt=timestamp();const body={title:title.slice(0,100),description:description.slice(0,3000),sectorId:data.sectorId,authorName:String(data.authorName||'').trim().slice(0,80),className:String(data.className||'').trim().slice(0,20),contact:String(data.contact||'').trim().slice(0,120),status:'new',source:'public',createdAt};
      const batch=state.db.batch();batch.set(initiativeRef,body);batch.set(trackingRef,{trackingId:id,title:body.title,sectorId:body.sectorId,status:'new',createdAt,updatedAt:createdAt});batch.set(feedRef,{type:'initiative',title:body.title,recordId:id,createdAt});await batch.commit();
      form.reset();hideInitiativeForm();showPublicConfirmation(id);
    }catch(err){console.error('Public initiative submission:',err);error.textContent=err.code==='permission-denied'?'Firestore отклонил отправку. Проверьте опубликованные правила Firestore.':'Не удалось отправить инициативу. Проверьте соединение с Firebase.';}
    finally{button.disabled=false;button.innerHTML='Отправить инициативу <span>→</span>';}
  }
  function showPublicConfirmation(id){
    const url=trackingLink(id),dialog=document.createElement('div');dialog.className='public-confirmation';
    dialog.innerHTML=`<div><span>✳</span><h3>Инициатива отправлена</h3><p>Сохрани ID обращения и ссылку: по ним можно проверить статус без входа в CRM.</p><strong class="confirmation-id">${escapeHtml(id)}</strong><input class="confirmation-link" readonly value="${escapeHtml(url)}"><div class="confirmation-actions"><button type="button" class="button button-primary" data-copy-tracking>Скопировать ссылку</button><a class="button button-outline" href="${escapeHtml(url)}">Отследить статус</a></div><button type="button" class="text-button confirmation-close">Закрыть</button></div>`;
    document.body.appendChild(dialog);dialog.querySelector('[data-copy-tracking]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url);dialog.querySelector('[data-copy-tracking]').textContent='Ссылка скопирована';}catch(_){dialog.querySelector('.confirmation-link').select();}});dialog.querySelector('.confirmation-close').addEventListener('click',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.remove();});
  }
  async function submitTracking(event){
    event.preventDefault();const id=String($('#trackingIdInput').value||'').trim().toUpperCase(),error=$('#trackingError'),result=$('#trackingResult');error.textContent='';result.innerHTML='';
    if(!/^IN-\d{8}-[A-HJ-NP-Z2-9]{8}$/.test(id)){error.textContent='Проверь формат ID. Пример: IN-20261125-AB12CD34';return;}
    try{const snap=await state.db.collection('initiativeTracking').doc(id).get();if(!snap.exists){error.textContent='Обращение с таким ID не найдено. Проверь ID и попробуй ещё раз.';return;}const item=snap.data();result.innerHTML=`<article class="tracking-result-card"><div class="crm-record-top"><span class="crm-record-sector">${escapeHtml(sectorName(item.sectorId))}</span><span class="crm-status">${escapeHtml(statusText(item.status))}</span></div><h3>${escapeHtml(item.title||'Инициатива')}</h3><p><b>ID:</b> ${escapeHtml(id)}</p><p><b>Отправлено:</b> ${escapeHtml(formatDateTime(item.createdAt))}</p><p><b>Последнее обновление:</b> ${escapeHtml(formatDateTime(item.updatedAt))}</p><p class="tracking-status-text">${escapeHtml(trackingStatusDescription(item.status))}</p></article>`;history.replaceState({},'',trackingLink(id));}
    catch(err){console.error(err);error.textContent='Не удалось получить статус. Проверь правила Firestore и повтори попытку.';}
  }
  function trackingStatusDescription(status){return({new:'Обращение получено и ожидает рассмотрения.',reviewing:'Совет изучает предложение и определяет дальнейшие действия.',accepted:'Инициатива принята. Команда может приступить к подготовке.',in_progress:'По инициативе ведётся работа.',done:'Работа по инициативе завершена.',rejected:'Совет принял решение не реализовывать эту инициативу.'})[status]||'Статус обращения обновляется.';}
  async function openTrackingFromUrl(){const id=new URLSearchParams(window.location.search).get('tracking');if(!id)return;$('#trackingIdInput').value=id;await submitTracking({preventDefault(){}});$('#track')?.scrollIntoView({behavior:'smooth'});}

  async function saveParticipantProfile(event){
    event.preventDefault();if(!isChair())return;const form=$('#participantForm'),message=$('#participantMessage'),data=Object.fromEntries(new FormData(form).entries());const email=normalizeEmail(data.email),uid=String(data.uid||'').trim();
    if(!validEmail(email)){message.textContent='Проверьте адрес электронной почты.';return;}if(!/^[A-Za-z0-9_-]{10,150}$/.test(uid)){message.textContent='Проверьте UID из Firebase Authentication.';return;}if(!['member','sector_lead','administrative','deputy_chair','secretary'].includes(data.role)){message.textContent='Выбрана недопустимая роль.';return;}
    const sectorId=forcedSectorId(data.role)||data.sectorId||'';if(data.role==='sector_lead'&&(!sectorId||sectorId==='administrative')){message.textContent='Руководителю нужно назначить рабочий сектор.';return;}if(data.role==='member'&&sectorId==='administrative'){message.textContent='Для административного сектора выберите роль «Участник административного сектора».';return;}if(sectorId&&!sectors.some(sector=>sector.id===sectorId)){message.textContent='Выбран неизвестный сектор.';return;}
    try{const ref=state.db.collection('users').doc(uid);if((await ref.get()).exists){message.textContent='Профиль с таким UID уже существует.';return;}const duplicate=await state.db.collection('users').where('email','==',email).limit(1).get();if(!duplicate.empty){message.textContent='Профиль с этой почтой уже существует.';return;}await ref.set({name:String(data.name).trim().slice(0,100),email,role:data.role,sectorId,active:true,showOnSite:false,createdAt:timestamp()});message.textContent=`Профиль добавлен. Роль: ${roleLabel(data.role)}. Сектор: ${sectorName(sectorId)}.`;form.reset();syncRoleSector($('#newParticipantRole'),$('#newParticipantSector'));}
    catch(err){console.error(err);message.textContent=err.code==='permission-denied'?'Firestore запретил запись. Проверьте роль председателя и правила.':'Не удалось сохранить профиль. Убедитесь, что UID относится к пользователю Firebase Authentication.';}
  }
  async function saveParticipantAssignment(uid){
    if(!isChair()||!uid)return;
    const user=state.users.find(item=>item.uid===uid);if(!user)return;
    const roleSelect=$(`[data-person-role="${CSS.escape(uid)}"]`),sectorSelect=$(`[data-person-sector="${CSS.escape(uid)}"]`),activeSelect=$(`[data-person-active="${CSS.escape(uid)}"]`),publicSelect=$(`[data-person-public="${CSS.escape(uid)}"]`);
    const newRole=user.role==='chair'?'chair':roleSelect?.value;
    const newSector=user.role==='chair'?'administrative':(forcedSectorId(newRole)||sectorSelect?.value||'');
    const active=user.role==='chair'?true:(activeSelect?activeSelect.value==='true':user.active!==false);
    const showOnSite=active && (publicSelect?publicSelect.checked:user.showOnSite===true);
    if(user.role!=='chair'&&!['member','sector_lead','administrative','deputy_chair','secretary'].includes(newRole)){showToast('Недопустимая роль','Выберите роль из списка.');return;}
    if(newRole==='sector_lead'&&(!newSector||newSector==='administrative')){showToast('Нужен рабочий сектор','Руководителю нельзя назначить административный сектор.');return;}
    if(newRole==='member'&&newSector==='administrative'){showToast('Уточните роль','Для административного сектора выберите роль «Участник административного сектора».');return;}
    if(newSector&&!sectors.some(item=>item.id===newSector)){showToast('Неизвестный сектор','Проверьте выбранное направление.');return;}
    const button=$(`[data-save-person="${CSS.escape(uid)}"]`);if(button){button.disabled=true;button.textContent='Сохранение…';}
    try{
      const userRef=state.db.collection('users').doc(uid),publicRef=state.db.collection('publicTeam').doc(uid),batch=state.db.batch();
      batch.update(userRef,{role:newRole,sectorId:newSector,active,showOnSite,updatedAt:timestamp()});
      if(showOnSite){
        batch.set(publicRef,{name:user.name||'Участник Совета',role:newRole,sectorId:newSector,published:true,updatedAt:timestamp()});
      }else{
        const publicSnap=await publicRef.get();if(publicSnap.exists)batch.delete(publicRef);
      }
      await batch.commit();if(uid===profile().uid){state.profile.showOnSite=showOnSite;state.profile.active=active;state.profile.sectorId=newSector;}if(button){button.disabled=false;button.textContent='Сохранено';}
      showToast(showOnSite?'Профиль опубликован':'Профиль обновлён',showOnSite?'Участник появится на публичной странице команды.':'Изменения сохранены в составе Совета.');
    }
    catch(error){console.error('Participant role/public profile update:',error);showToast('Не удалось сохранить','Проверьте права председателя и актуальные правила Firestore.');if(button){button.disabled=false;button.textContent='Сохранить';}}
  }


  async function saveInitiativeUpdate(id,patch){
    if(!canManageInitiatives()||!id)return;const item=state.initiatives.find(entry=>entry.id===id);if(!item)return;
    const nextStatus=patch.status||item.status,nextSector=patch.sectorId||item.sectorId;const batch=state.db.batch();
    batch.update(state.db.collection('initiatives').doc(id),{...patch,updatedAt:timestamp(),updatedBy:profile().uid});
    batch.update(state.db.collection('initiativeTracking').doc(id),{status:nextStatus,sectorId:nextSector,updatedAt:timestamp()});
    try{await batch.commit();showToast('Обращение обновлено',`${id}: ${statusText(nextStatus)}.`);}catch(error){console.error(error);showToast('Ошибка обновления','Не удалось сохранить статус обращения.');}
  }
  async function saveSectorPlan(event){
    event.preventDefault();const form=event.currentTarget,sectorId=form.dataset.sector;if(!(isAdministrativeRole()||(isSectorLead()&&currentSectorId()===sectorId)))return;const data=Object.fromEntries(new FormData(form).entries());
    try{await state.db.collection('sectorPlans').doc(sectorId).set({sectorId,goal:String(data.goal||'').trim().slice(0,180),plan:String(data.plan||'').trim().slice(0,5000),published:!!form.querySelector('[name="published"]')?.checked,updatedBy:profile().uid,updatedAt:timestamp()},{merge:true});const message=form.querySelector('[role="status"]');if(message)message.textContent='План сектора сохранён.';showToast('План обновлён',sectorName(sectorId));}
    catch(error){console.error(error);const message=form.querySelector('[role="status"]');if(message)message.textContent='Не удалось сохранить план. Проверьте правила Firestore.';}
  }

  async function saveMeeting(event){
    event.preventDefault();if(!canManageMeetings())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),button=form.querySelector('button[type="submit"]');if(!data.title||!data.date)return;button.disabled=true;
    try{const ref=state.db.collection('meetings').doc(),feed=state.db.collection('activityFeed').doc(),body={title:String(data.title).trim().slice(0,140),date:data.date,time:data.time||'',location:String(data.location||'').trim().slice(0,120),agenda:String(data.agenda||'').trim().slice(0,4000),status:data.status||'planned',published:!!form.querySelector('[name="published"]')?.checked,createdBy:profile().uid,createdAt:timestamp()};const batch=state.db.batch();batch.set(ref,body);batch.set(feed,{type:'meeting',title:body.title,recordId:ref.id,createdAt:timestamp()});await batch.commit();form.reset();$('#meetingMessage').textContent='Собрание создано. Участникам отправлено уведомление в CRM.';showToast('Собрание добавлено',body.title,'meeting');}
    catch(error){console.error(error);$('#meetingMessage').textContent='Не удалось создать собрание. Проверьте правила Firestore.';}finally{button.disabled=false;}
  }
  async function savePoll(event){
    event.preventDefault();if(!canManagePolls())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),options=String(data.options||'').split(/\r?\n/).map(item=>item.trim()).filter(Boolean).slice(0,10);if(options.length<2){$('#pollMessage').textContent='Добавьте минимум два варианта ответа.';return;}if(options.some(item=>item.length>120)){ $('#pollMessage').textContent='Длина варианта не должна превышать 120 символов.';return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const ref=state.db.collection('polls').doc(),feed=state.db.collection('activityFeed').doc(),body={title:String(data.title).trim().slice(0,180),description:String(data.description||'').trim().slice(0,1500),type:data.type==='multiple'?'multiple':'single',options:options.map((label,index)=>({id:`o${index+1}`,label})),status:'open',endsAt:data.endsAt?firebase.firestore.Timestamp.fromDate(new Date(data.endsAt)):null,published:!!form.querySelector('[name="published"]')?.checked,createdBy:profile().uid,createdAt:timestamp()};const batch=state.db.batch();batch.set(ref,body);batch.set(feed,{type:'poll',title:body.title,recordId:ref.id,createdAt:timestamp()});await batch.commit();form.reset();$('#pollMessage').textContent='Голосование создано. Участникам отправлено уведомление.';showToast('Голосование создано',body.title,'poll');}
    catch(error){console.error(error);$('#pollMessage').textContent='Не удалось создать голосование. Проверьте правила Firestore.';}finally{button.disabled=false;}
  }
  async function castVote(event){
    event.preventDefault();const form=event.currentTarget,pollId=form.dataset.votePoll,poll=state.polls.find(item=>item.id===pollId);if(!poll||poll.status!=='open'||(poll.endsAt?.toDate&&poll.endsAt.toDate()<new Date()))return;const selected=[...new FormData(form).getAll('optionIds')];if(!selected.length){showToast('Выберите вариант','Для отправки голоса нужно выбрать ответ.');return;}if(poll.type==='single'&&selected.length!==1)return;
    try{await state.db.collection('polls').doc(pollId).collection('votes').doc(profile().uid).set({selectedOptionIds:selected,updatedAt:timestamp(),createdAt:timestamp()});showToast('Голос принят','Ваш выбор сохранён.');}
    catch(error){console.error(error);showToast('Не удалось проголосовать','Проверьте, что голосование открыто.');}
  }
  async function changePollStatus(id,status){if(!canManagePolls()||!['open','closed'].includes(status))return;try{await state.db.collection('polls').doc(id).update({status,updatedAt:timestamp()});showToast('Голосование обновлено',status==='open'?'Голосование открыто.':'Голосование завершено.');}catch(error){console.error(error);showToast('Ошибка','Не удалось изменить статус голосования.');}}
  async function changeMeetingStatus(id,status){if(!canManageMeetings()||!MEETING_STATUSES[status])return;try{await state.db.collection('meetings').doc(id).update({status,updatedAt:timestamp()});showToast('Собрание обновлено',MEETING_STATUSES[status]);}catch(error){console.error(error);showToast('Ошибка','Не удалось изменить статус собрания.');}}
  async function changeProjectStatus(id,status){if(!canManageProjects()||!PROJECT_STATUSES[status])return;try{await state.db.collection('projects').doc(id).update({status,updatedAt:timestamp()});showToast('Проект обновлён',PROJECT_STATUSES[status]);}catch(error){console.error(error);showToast('Ошибка','Не удалось изменить статус проекта.');}}
  async function changeDecisionStatus(id,status){if(!isAdministrativeRole()||!DECISION_STATUSES[status])return;try{await state.db.collection('decisions').doc(id).update({status,updatedAt:timestamp()});showToast('Решение обновлено',DECISION_STATUSES[status]);}catch(error){console.error(error);showToast('Ошибка','Не удалось изменить статус решения.');}}
  async function saveProject(event){
    event.preventDefault();if(!canManageProjects())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());const sectorId=isSectorLead()?currentSectorId():data.sectorId;if(isSectorLead()&&data.sectorId!==currentSectorId())return;
    try{await state.db.collection('projects').add({title:String(data.title).trim().slice(0,140),description:String(data.description).trim().slice(0,3000),sectorId,leadName:String(data.leadName||profile().name).trim().slice(0,100),status:data.status||'idea',startDate:data.startDate||'',endDate:data.endDate||'',published:!!form.querySelector('[name="published"]')?.checked,createdBy:profile().uid,createdAt:timestamp()});form.reset();$('#projectMessage').textContent='Проект добавлен.';}
    catch(error){console.error(error);$('#projectMessage').textContent='Не удалось добавить проект. Проверьте правила Firestore.';}
  }
  async function saveTask(event){
    event.preventDefault();if(!canManageTasks())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),sectorId=isSectorLead()?currentSectorId():data.sectorId,assigneeUid=data.assigneeUid||'',assignee=state.users.find(user=>user.uid===assigneeUid);
    if(isSectorLead()&&sectorId!==currentSectorId())return;
    try{await state.db.collection('tasks').add({title:String(data.title).trim().slice(0,140),description:String(data.description||'').trim().slice(0,3000),sectorId,assigneeUid,assigneeName:assignee?.name||(assigneeUid===profile().uid?profile().name:''),dueDate:data.dueDate||'',priority:data.priority||'normal',status:'new',createdBy:profile().uid,createdAt:timestamp()});form.reset();$('#taskMessage').textContent='Задача создана.';}
    catch(error){console.error(error);$('#taskMessage').textContent='Не удалось создать задачу. Проверьте правила Firestore.';}
  }
  async function changeTaskStatus(id,status){if(!TASK_STATUSES[status])return;try{await state.db.collection('tasks').doc(id).update({status,updatedAt:timestamp()});}catch(error){console.error(error);showToast('Не удалось изменить задачу','Проверьте права доступа.');}}
  async function saveDecision(event){
    event.preventDefault();if(!isAdministrativeRole())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());
    try{await state.db.collection('decisions').add({title:String(data.title).trim().slice(0,160),description:String(data.description).trim().slice(0,3000),sectorId:data.sectorId||'administrative',status:data.status||'accepted',meetingTitle:String(data.meetingTitle||'').trim().slice(0,140),createdBy:profile().uid,createdAt:timestamp()});form.reset();$('#decisionMessage').textContent='Решение сохранено.';}
    catch(error){console.error(error);$('#decisionMessage').textContent='Не удалось сохранить решение. Проверьте правила Firestore.';}
  }
  async function saveAnnouncement(event){
    event.preventDefault();if(!canManageAnnouncements())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),sectorId=profile().sectorId==='information'&&!isAdministrativeRole()?currentSectorId():(data.sectorId||'information');
    try{await state.db.collection('announcements').add({title:String(data.title).trim().slice(0,140),content:String(data.content).trim().slice(0,5000),sectorId,published:!!form.querySelector('[name="published"]')?.checked,createdBy:profile().uid,createdAt:timestamp()});form.reset();$('#announcementMessage').textContent='Объявление сохранено.';}
    catch(error){console.error(error);$('#announcementMessage').textContent='Не удалось сохранить объявление. Проверьте правила Firestore.';}
  }
  async function saveDocument(event){
    event.preventDefault();if(!canManageDocuments())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),url=String(data.url||'').trim();if(url&&!/^https?:\/\//i.test(url)){ $('#documentMessage').textContent='Ссылка должна начинаться с https:// или http://';return;}
    try{await state.db.collection('documents').add({title:String(data.title).trim().slice(0,150),category:String(data.category||'').trim().slice(0,60),description:String(data.description||'').trim().slice(0,1600),url,content:String(data.content||'').trim().slice(0,12000),published:!!form.querySelector('[name="published"]')?.checked,sectorId:currentSectorId()||'administrative',createdBy:profile().uid,createdAt:timestamp()});form.reset();$('#documentMessage').textContent='Материал добавлен.';}
    catch(error){console.error(error);$('#documentMessage').textContent='Не удалось добавить документ. Проверьте правила Firestore.';}
  }
  async function saveSectorReport(event){
    event.preventDefault();if(!isSectorLead())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());
    if(!currentSectorId()||currentSectorId()==='administrative'){ $('#sectorReportMessage').textContent='Отчёт доступен руководителю рабочего сектора.';return; }
    try{await state.db.collection('sectorReports').add({sectorId:currentSectorId(),period:data.period||'',title:String(data.title||'').trim().slice(0,140),summary:String(data.summary||'').trim().slice(0,1800),achievements:String(data.achievements||'').trim().slice(0,3000),problems:String(data.problems||'').trim().slice(0,2000),nextSteps:String(data.nextSteps||'').trim().slice(0,2000),status:'submitted',createdBy:profile().uid,createdAt:timestamp(),updatedAt:timestamp()});form.reset();$('#sectorReportMessage').textContent='Отчёт отправлен административному сектору.';showToast('Отчёт отправлен',sectorName(currentSectorId()));}
    catch(error){console.error(error);$('#sectorReportMessage').textContent='Не удалось отправить отчёт. Проверьте правила Firestore.';}
  }
  async function changeReportStatus(id,status){if(!isAdministrativeRole()||!REPORT_STATUSES[status])return;try{await state.db.collection('sectorReports').doc(id).update({status,updatedAt:timestamp()});showToast('Статус отчёта изменён',REPORT_STATUSES[status]);}catch(error){console.error(error);showToast('Ошибка','Не удалось изменить статус отчёта.');}}
  async function saveReportNote(id){if(!isAdministrativeRole()||!id)return;const input=$(`[data-report-note="${CSS.escape(id)}"]`);if(!input)return;try{await state.db.collection('sectorReports').doc(id).update({reviewNote:String(input.value||'').trim().slice(0,600),updatedAt:timestamp()});showToast('Комментарий сохранён','Руководитель сектора увидит его в отчёте.');}catch(error){console.error(error);showToast('Ошибка','Не удалось сохранить комментарий.');}}
  async function saveSettings(event){
    event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),message=$('#settingsMessage'),user=state.auth?.currentUser;
    if(!user?.email){message.textContent='Не удалось определить аккаунт Firebase Authentication.';return;}
    if(String(data.newPassword||'').length<8){message.textContent='Новый пароль должен содержать не менее 8 символов.';return;}
    if(data.newPassword!==data.confirmPassword){message.textContent='Новые пароли не совпадают.';return;}
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{const credential=firebase.auth.EmailAuthProvider.credential(user.email,data.currentPassword);await user.reauthenticateWithCredential(credential);await user.updatePassword(data.newPassword);form.reset();message.textContent='Пароль успешно изменён.';showToast('Пароль обновлён','Изменение сохранено в Firebase Authentication.');}
    catch(error){console.error(error);message.textContent=error.code==='auth/wrong-password'||error.code==='auth/invalid-credential'?'Текущий пароль указан неверно.':error.code==='auth/requires-recent-login'?'Войдите в аккаунт заново и повторите попытку.':'Не удалось изменить пароль. Проверьте соединение и настройки Firebase Authentication.';}
    finally{button.disabled=false;}
  }

  async function saveAccount(event){
    event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),name=String(data.name||'').trim().slice(0,100);if(!name){$('#accountMessage').textContent='Укажите имя.';return;}
    try{const contact=String(data.contact||'').trim().slice(0,80),batch=state.db.batch();batch.update(state.db.collection('users').doc(profile().uid),{name,contact,updatedAt:timestamp()});if(profile().showOnSite===true)batch.update(state.db.collection('publicTeam').doc(profile().uid),{name,updatedAt:timestamp()});await batch.commit();state.profile.name=name;state.profile.contact=contact;$('#userName').textContent=name;$('#userAvatar').textContent=name.trim().charAt(0).toUpperCase();$('#accountMessage').textContent='Профиль обновлён.';}
    catch(error){console.error(error);$('#accountMessage').textContent='Не удалось обновить профиль. Проверьте правила Firestore.';}
  }

  async function saveRecordEdit(event){
    event.preventDefault();const form=event.currentTarget,collection=form.dataset.editCollection,id=form.dataset.recordId;if(!id)return;
    const data=Object.fromEntries(new FormData(form).entries());let patch={};
    if(collection==='meetings'&&canManageMeetings())patch={title:String(data.title||'').trim().slice(0,140),date:data.date||'',time:data.time||'',location:String(data.location||'').trim().slice(0,120),agenda:String(data.agenda||'').trim().slice(0,4000),published:!!form.querySelector('[name="published"]')?.checked};
    else if(collection==='polls'&&canManagePolls())patch={title:String(data.title||'').trim().slice(0,180),description:String(data.description||'').trim().slice(0,1500)};
    else if(collection==='projects'&&canManageProjects())patch={title:String(data.title||'').trim().slice(0,140),description:String(data.description||'').trim().slice(0,3000),leadName:String(data.leadName||'').trim().slice(0,100),startDate:data.startDate||'',endDate:data.endDate||'',published:!!form.querySelector('[name="published"]')?.checked};
    else if(collection==='tasks'&&canManageTasks()){
      const assigneeUid=data.assigneeUid||'',assignee=state.users.find(user=>user.uid===assigneeUid);
      patch={title:String(data.title||'').trim().slice(0,140),description:String(data.description||'').trim().slice(0,3000),dueDate:data.dueDate||'',priority:data.priority||'normal',assigneeUid,assigneeName:assignee?.name||(assigneeUid===profile().uid?profile().name:'')};
    }
    else if(collection==='decisions'&&isAdministrativeRole())patch={title:String(data.title||'').trim().slice(0,160),description:String(data.description||'').trim().slice(0,3000),meetingTitle:String(data.meetingTitle||'').trim().slice(0,140)};
    else if(collection==='announcements'&&canManageAnnouncements())patch={title:String(data.title||'').trim().slice(0,140),content:String(data.content||'').trim().slice(0,5000)};
    else if(collection==='documents'&&canManageDocuments()){
      const url=String(data.url||'').trim();if(url&&!/^https?:\/\//i.test(url)){form.querySelector('[role="status"]').textContent='Ссылка должна начинаться с http:// или https://';return;}
      patch={title:String(data.title||'').trim().slice(0,150),category:String(data.category||'').trim().slice(0,60),description:String(data.description||'').trim().slice(0,1600),url,content:String(data.content||'').trim().slice(0,12000)};
    }
    else if(collection==='sectorReports'&&isSectorLead()){
      const report=state.reports.find(item=>item.id===id);if(!report||report.status!=='revision'||report.createdBy!==profile().uid||report.sectorId!==currentSectorId()){form.querySelector('[role="status"]').textContent='Этот отчёт нельзя отправить повторно.';return;}
      patch={summary:String(data.summary||'').trim().slice(0,1800),achievements:String(data.achievements||'').trim().slice(0,3000),problems:String(data.problems||'').trim().slice(0,2000),nextSteps:String(data.nextSteps||'').trim().slice(0,2000),status:'submitted'};
    }
    if(!Object.keys(patch).length){form.querySelector('[role="status"]').textContent='Нет прав на изменение этой записи.';return;}
    if(collection!=='sectorReports'&&(!patch.title||patch.title.length<2)){form.querySelector('[role="status"]').textContent='Укажите название.';return;}
    if(collection==='sectorReports'&&(!patch.summary||patch.summary.length<1)){form.querySelector('[role="status"]').textContent='Добавьте краткий итог отчёта.';return;}
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{await state.db.collection(collection).doc(id).update({...patch,updatedAt:timestamp()});form.querySelector('[role="status"]').textContent='Изменения сохранены.';showToast('Запись обновлена','Изменения сохранены в Firestore.');}
    catch(error){console.error(error);form.querySelector('[role="status"]').textContent='Не удалось сохранить изменения. Проверьте права доступа и правила Firestore.';}
    finally{submit.disabled=false;}
  }

  async function deleteRecord(collection,id,allowed){
    if(!allowed||!id)return;
    if(!confirm('Удалить эту запись? Это действие нельзя отменить.'))return;
    try{
      if(collection==='polls'){
        const votesRef=state.db.collection('polls').doc(id).collection('votes');
        const votes=await votesRef.get();
        if(votes.size>450){showToast('Слишком много голосов','Закройте голосование вместо удаления: в нём больше 450 голосов.');return;}
        const batch=state.db.batch();votes.docs.forEach(doc=>batch.delete(doc.ref));batch.delete(state.db.collection('polls').doc(id));await batch.commit();
      } else { await state.db.collection(collection).doc(id).delete(); }
      showToast('Запись удалена','Изменение сохранено.');
    }catch(error){console.error(error);showToast('Удаление запрещено','Проверьте права доступа и правила Firestore.');}
  }
  async function updatePublished(collection,id,published){try{await state.db.collection(collection).doc(id).update({published,updatedAt:timestamp()});}catch(error){console.error(error);showToast('Не удалось изменить публикацию','Проверьте права доступа.');}}

  function initWorkspaceNavigation(){
    $('#workspaceNav')?.addEventListener('click',event=>{const button=event.target.closest('[data-workpage]');if(button&&!button.hidden)renderWorkspacePage(button.dataset.workpage);const publicHome=event.target.closest('[data-show-public-home]');if(publicHome)showPublicSite();});
    $('#workspaceContent')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-go-page]');if(button)renderWorkspacePage(button.dataset.goPage);
      const taskTab=event.target.closest('[data-task-tab]');if(taskTab){state.taskTab=taskTab.dataset.taskTab;renderWorkspacePage('tasks');}
      const savePerson=event.target.closest('[data-save-person]');if(savePerson)saveParticipantAssignment(savePerson.dataset.savePerson);
      const reportNoteButton=event.target.closest('[data-save-report-note]');if(reportNoteButton)saveReportNote(reportNoteButton.dataset.saveReportNote);
      const remove=event.target.closest('[data-delete-meeting],[data-delete-poll],[data-delete-project],[data-delete-task],[data-delete-decision],[data-delete-announcement],[data-delete-document]');
      if(remove){const mapping=[['data-delete-meeting','meetings',canManageMeetings()],['data-delete-poll','polls',canManagePolls()],['data-delete-project','projects',canManageProjects()],['data-delete-task','tasks',canManageTasks()],['data-delete-decision','decisions',isAdministrativeRole()],['data-delete-announcement','announcements',canManageAnnouncements()],['data-delete-document','documents',canManageDocuments()]];for(const [attr,col,allowed] of mapping){if(remove.hasAttribute(attr)){deleteRecord(col,remove.getAttribute(attr),allowed);break;}}}
      const copy=event.target.closest('[data-copy-text]');if(copy){if(navigator.clipboard?.writeText){navigator.clipboard.writeText(copy.dataset.copyText).then(()=>showToast('Ссылка скопирована','Её можно отправить автору обращения.')).catch(()=>showToast('Не удалось скопировать','Скопируйте ссылку вручную.'));}else{showToast('Скопируйте ссылку вручную',copy.dataset.copyText);}}
      if(event.target.closest('[data-refresh-crm]')){startCRMListeners();showToast('Данные обновляются','CRM подключает актуальные данные Firestore.');}
      const openInitiative=event.target.closest('[data-open-initiative-record]');if(openInitiative){$('#notificationPanel').hidden=true;renderWorkspacePage('initiatives');}
    });
    $('#workspaceContent')?.addEventListener('change',event=>{
      const status=event.target.closest('[data-initiative-status]'),sector=event.target.closest('[data-initiative-sector]'),personRole=event.target.closest('[data-person-role]');
      if(status)saveInitiativeUpdate(status.dataset.initiativeStatus,{status:status.value});if(sector)saveInitiativeUpdate(sector.dataset.initiativeSector,{sectorId:sector.value});
      if(personRole)syncRoleSector(personRole,$(`[data-person-sector="${CSS.escape(personRole.dataset.personRole)}"]`));if(event.target.matches('#newParticipantRole'))syncRoleSector($('#newParticipantRole'),$('#newParticipantSector'));
      if(event.target.matches('[data-meeting-status]'))changeMeetingStatus(event.target.dataset.meetingStatus,event.target.value);
      if(event.target.matches('[data-poll-status]'))changePollStatus(event.target.dataset.pollStatus,event.target.value);
      if(event.target.matches('[data-project-status]'))changeProjectStatus(event.target.dataset.projectStatus,event.target.value);
      if(event.target.matches('[data-task-status]'))changeTaskStatus(event.target.dataset.taskStatus,event.target.value);
      if(event.target.matches('[data-decision-status]'))changeDecisionStatus(event.target.dataset.decisionStatus,event.target.value);
      if(event.target.matches('[data-announcement-published]'))updatePublished('announcements',event.target.dataset.announcementPublished,event.target.checked);
      if(event.target.matches('[data-document-published]'))updatePublished('documents',event.target.dataset.documentPublished,event.target.checked);
      if(event.target.matches('[data-report-status]'))changeReportStatus(event.target.dataset.reportStatus,event.target.value);
    });
    // Global delegation: CRM pages are re-rendered dynamically, so listen on document.
    document.addEventListener('submit',event=>{
      const form=event.target;
      if(!(form instanceof HTMLFormElement))return;
      const handlers={participantForm:saveParticipantProfile,sectorPlanForm:saveSectorPlan,sectorReportForm:saveSectorReport,meetingForm:saveMeeting,pollForm:savePoll,projectForm:saveProject,taskForm:saveTask,decisionForm:saveDecision,announcementForm:saveAnnouncement,documentForm:saveDocument,accountForm:saveAccount,settingsForm:saveSettings};
      const handler=handlers[form.id] || (form.matches('.sector-plan-form')?saveSectorPlan:form.matches('[data-vote-poll]')?castVote:form.matches('[data-edit-collection]')?saveRecordEdit:null);
      if(!handler)return;
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const original=button?.innerHTML;
      if(button){button.disabled=true;button.classList.add('is-loading');button.innerHTML='<span class="button-spinner" aria-hidden="true"></span> Сохранение…';}
      const formEvent={target:form,currentTarget:form,submitter:event.submitter||null,preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()};
      Promise.resolve().then(()=>handler(formEvent)).catch(error=>{
        console.error('[CRM form]',form.id,error);
        const message=form.querySelector('[role="status"],.crm-form-message');
        if(message)message.textContent=error?.message||'Не удалось сохранить запись.';
        showToast('Ошибка сохранения',error?.message||'Проверьте доступ к Firestore.');
      }).finally(()=>{
        if(button&&button.isConnected){button.disabled=false;button.classList.remove('is-loading');button.innerHTML=original||'Сохранить';}
      });
    });
    $('#workspaceMenuToggle')?.addEventListener('click',()=>$('#workspace').classList.toggle('menu-open'));
    $('#workspace')?.addEventListener('click',event=>{if(event.target.closest('.workspace-nav [data-workpage]')||event.target.closest('[data-show-public-home]'))$('#workspace').classList.remove('menu-open');});
    $('#notificationButton')?.addEventListener('click',()=>{const panel=$('#notificationPanel'),opened=panel.hidden;panel.hidden=!opened;$('#notificationButton').setAttribute('aria-expanded',String(opened));});
    $('#notificationPanel')?.addEventListener('click',event=>{const item=event.target.closest('[data-open-initiative-record]');if(item){$('#notificationPanel').hidden=true;if(canManageInitiatives())renderWorkspacePage('initiatives');else showToast('Новое обращение','Инициатива поступила в Совет и будет рассмотрена ответственным сектором.');return;}const button=event.target.closest('[data-go-page]');if(button){$('#notificationPanel').hidden=true;renderWorkspacePage(button.dataset.goPage);}});
  }

  function initEvents(){
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-open-login]'))showLogin();
      if(event.target.closest('[data-open-workspace]'))showWorkspace();
      if(event.target.closest('[data-open-initiative]'))showInitiativeForm();
    });
    $('#closeLogin')?.addEventListener('click',hideLogin);$('#loginOverlay')?.addEventListener('click',event=>{if(event.target.id==='loginOverlay')hideLogin();});$('#loginForm')?.addEventListener('submit',submitLogin);
    $('#logoutButton')?.addEventListener('click',()=>state.auth?.signOut());
    $('#closeInitiative')?.addEventListener('click',hideInitiativeForm);$('#initiativeOverlay')?.addEventListener('click',event=>{if(event.target.id==='initiativeOverlay')hideInitiativeForm();});$('#initiativeForm')?.addEventListener('submit',submitPublicInitiative);
    $('#trackingForm')?.addEventListener('submit',submitTracking);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideLogin();hideInitiativeForm();$('#notificationPanel').hidden=true;}});
  }

  function hidePageLoader(){const loader=$('#pageLoader');if(loader){loader.classList.add('is-hidden');window.setTimeout(()=>loader.remove(),450);}}

  function boot(){
    renderSectors();initMobileNavigation();initWorkspaceNavigation();initEvents();initFirebase();
    openTrackingFromUrl();
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
