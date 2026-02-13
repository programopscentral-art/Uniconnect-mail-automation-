import { json, error } from '@sveltejs/kit';
import { createAccessRequest, getAdmins, createNotification, getUserByEmail, getUserFcmTokens } from '@uniconnect/shared';
import admin from '$lib/server/firebase-admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { universityIds } = await request.json();

    if (!Array.isArray(universityIds) || universityIds.length === 0) {
        throw error(400, 'At least one university ID is required');
    }

    try {
        const ar = await createAccessRequest(locals.user.id, universityIds);

        // Notify Main Admin (Centralized)
        const ADMIN_EMAIL = 'programopscentral@nxtwave.in';
        const mainAdmin = await getUserByEmail(ADMIN_EMAIL);

        if (mainAdmin) {
            const title = 'New Access Request';
            const message = `${locals.user.name || locals.user.email} is requesting access to ${universityIds.length} universities.`;
            const sourceId = `AR_${locals.user.id}_${new Date().toISOString().split('T')[0]}`; // Deduplicate per user per day

            // 1. In-App Notification
            await createNotification({
                user_id: mainAdmin.id,
                university_id: universityIds[0],
                title,
                message,
                type: 'ACCESS_REQUEST',
                link: '/users',
                source_id: sourceId
            });

            // 2. Push Notification (FCM)
            const tokens = await getUserFcmTokens(mainAdmin.id);
            const uniqueTokens = [...new Set(tokens)];

            if (uniqueTokens.length > 0 && admin.apps.length > 0) {
                try {
                    await admin.messaging().sendEachForMulticast({
                        notification: { title, body: message },
                        data: { action: 'OPEN_REQUESTS' },
                        tokens: uniqueTokens
                    });
                } catch (pushErr) {
                    console.error('Failed to send admin push notification:', pushErr);
                }
            }
        }

        return json(ar);
    } catch (err: any) {
        console.error('Failed to create access request:', err);
        throw error(500, 'Internal Server Error');
    }
};
