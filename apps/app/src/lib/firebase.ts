import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { browser } from "$app/environment";

const firebaseConfig = {
    apiKey: "AIzaSyA9VOHEX2rWxJU-4Bd-qb6aQmDWFeANgj0",
    authDomain: "uniconnect-mailer.firebaseapp.com",
    projectId: "uniconnect-mailer",
    storageBucket: "uniconnect-mailer.firebasestorage.app",
    messagingSenderId: "583176893164",
    appId: "1:583176893164:web:9d348802d7bb60bc0fabc9",
    measurementId: "G-BXWKZPXJGE"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const getFcmToken = async () => {
    if (!browser) return null;
    try {
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
            vapidKey: "BFDJf-mWLQkI6OV0UhKVSlBJYfnSxB9H3pGB8N_WsBUioHDUj3Hxz45BLXYwgJ8PeGR98YzjLasIyDgAE0AN3QU"
        });
        return token;
    } catch (error) {
        console.error("Error getting FCM token:", error);
        return null;
    }
};

export const onForegroundMessage = (callback: (payload: any) => void) => {
    if (!browser) return;
    const messaging = getMessaging(app);
    return onMessage(messaging, callback);
};

export { app };
