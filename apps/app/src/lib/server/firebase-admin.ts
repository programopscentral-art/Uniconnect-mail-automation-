import admin from 'firebase-admin';
import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'FIREBASE_DEBUG.log');
const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(msg);
};

if (admin.apps.length === 0) {
    const serviceAccountB64 = env.FIREBASE_SERVICE_ACCOUNT;
    log('[FIREBASE_ADMIN] 🔍 Checking FIREBASE_SERVICE_ACCOUNT env...');

    if (serviceAccountB64) {
        try {
            log(`[FIREBASE_ADMIN] ⚙️ Found env variable, length: ${serviceAccountB64.length}`);
            const serviceAccount = JSON.parse(
                Buffer.from(serviceAccountB64, 'base64').toString('utf-8')
            );

            log(`[FIREBASE_ADMIN] 🔑 Project ID from JSON: ${serviceAccount.project_id}`);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            log('[FIREBASE_ADMIN] ✅ Initialized successfully');
        } catch (error: any) {
            log(`[FIREBASE_ADMIN] ❌ Failed to initialize: ${error.message}`);
            if (error.stack) log(error.stack);
        }
    } else {
        log('[FIREBASE_ADMIN] ⚠️ FIREBASE_SERVICE_ACCOUNT env not found');
    }
}

export default admin;
