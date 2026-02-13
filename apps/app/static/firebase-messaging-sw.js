/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyA9VOHEX2rWxJU-4Bd-qb6aQmDWFeANgj0",
    authDomain: "uniconnect-mailer.firebaseapp.com",
    projectId: "uniconnect-mailer",
    storageBucket: "uniconnect-mailer.firebasestorage.app",
    messagingSenderId: "583176893164",
    appId: "1:583176893164:web:9d348802d7bb60bc0fabc9",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const title = payload.notification.title;
    const body = payload.notification.body;
    const taskId = payload.data?.taskId;
    const type = payload.data?.type;
    const action = payload.data?.action;
    const sourceId = payload.data?.sourceId || taskId || `notif-${Date.now()}`;

    const notificationOptions = {
        body: body,
        icon: '/nxtwave-logo.png',
        tag: sourceId,
        renotify: !!taskId,
        data: {
            taskId,
            type,
            action,
            url: taskId ? `/communication-tasks/${taskId}` : (action === 'OPEN_REQUESTS' ? '/users' : null)
        }
    };

    return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    let targetUrl = data?.url || '/';
    // Ensure absolute path
    if (targetUrl.startsWith('/')) {
        targetUrl = self.location.origin + targetUrl;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 1. Try to find existing tab
            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // 2. Try to find ANY app tab and navigate it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'navigate' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // 3. Open new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
