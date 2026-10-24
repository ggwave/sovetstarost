/* Firebase Cloud Messaging service worker. Uses the same public Firebase web config as the site. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyAKRxizCyVr634sdmB7mxRZudJpxD_EBsw',
  authDomain: 'sovet-701c5.firebaseapp.com',
  projectId: 'sovet-701c5',
  storageBucket: 'sovet-701c5.firebasestorage.app',
  messagingSenderId: '770061016694',
  appId: '1:770061016694:web:280d5caa6db66bea2d0957',
  measurementId: 'G-D4QTK30MWV'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'Совет старост';
  const options = { body: payload.notification?.body || '', icon: './icon-192.png', data: payload.data || {} };
  self.registration.showNotification(title, options);
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./#' + (event.notification.data?.linkPage || 's-notifications'), self.location.href).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) { if ('focus' in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
