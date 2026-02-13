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
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/nxtwave-logo.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const taskId = event.notification.data?.taskId;
    const targetUrl = taskId ? `/communication-tasks/${taskId}` : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there is already a window open with this URL
            for (const client of clientList) {
                const url = new URL(client.url);
                if (url.pathname === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window found, open a new one
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
