import admin from 'firebase-admin';
import { env } from '$env/dynamic/private';

if (admin.apps.length === 0) {
    const serviceAccountB64 = env.FIREBASE_SERVICE_ACCOUNT;

    if (serviceAccountB64) {
        try {
            const serviceAccount = JSON.parse(
                Buffer.from(serviceAccountB64, 'base64').toString('utf-8')
            );

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('[FIREBASE_ADMIN] ✅ Initialized successfully');
        } catch (error) {
            console.error('[FIREBASE_ADMIN] ❌ Failed to initialize:', error);
        }
    } else {
        console.warn('[FIREBASE_ADMIN] ⚠️ FIREBASE_SERVICE_ACCOUNT env not found');
    }
}

export default admin;
