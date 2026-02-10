import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, getUserFcmTokens } from '@uniconnect/shared';
import admin from '$lib/server/firebase-admin';

export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const tokens = await getUserFcmTokens(locals.user.id);

    if (tokens.length === 0) {
        throw error(400, 'No notification tokens registered for this device. Please enable notifications first.');
    }

    if (admin.apps.length === 0) {
        throw error(500, 'Firebase Admin not initialized on server.');
    }

    const message = {
        notification: {
            title: 'UniConnect Diagnostic 🔔',
            body: 'Your desktop notifications are working perfectly! You will receive alerts for your scheduled tasks here.',
        },
        data: {
            type: 'DIAGNOSTIC'
        },
        tokens
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        return json({
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        });
    } catch (err: any) {
        console.error('FCM Test Error:', err);
        throw error(500, 'FCM Service Error: ' + err.message);
    }
};
