import { json, error } from '@sveltejs/kit';
import { db, createNotification, getUserByEmail, getUserFcmTokens } from '@uniconnect/shared';
import admin from '$lib/server/firebase-admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { universityIds, roleIntent, subjectIds, subjectNames } = await request.json();

    if (!Array.isArray(universityIds) || universityIds.length === 0) {
        throw error(400, 'At least one university ID is required');
    }

    try {
        // Insert access request with optional role intent and subject metadata
        const arResult = await db.query(
            `INSERT INTO access_requests (user_id, university_ids, role_intent, requested_subject_ids, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                locals.user.id,
                universityIds,
                roleIntent || null,
                subjectIds?.length ? subjectIds : [],
                subjectNames?.length ? JSON.stringify({ subject_names: subjectNames }) : '{}'
            ]
        );
        const ar = arResult.rows[0];

        // Build notification message
        const userName = locals.user.full_name || locals.user.name || locals.user.email;
        const roleLabel = roleIntent === 'FACULTY' ? 'as Faculty/Instructor' : roleIntent ? `as ${roleIntent}` : '';
        const subjectLabel = subjectNames?.length
            ? ` — teaches: ${subjectNames.slice(0, 3).join(', ')}${subjectNames.length > 3 ? ` +${subjectNames.length - 3} more` : ''}`
            : '';

        const title = `New Access Request${roleIntent === 'FACULTY' ? ' — Faculty' : ''}`;
        const message = `${userName} is requesting access to ${universityIds.length} ${universityIds.length === 1 ? 'institution' : 'institutions'} ${roleLabel}${subjectLabel}.`;
        const sourceId = `AR_${locals.user.id}_${new Date().toISOString().split('T')[0]}`;

        // Notify central admin
        const ADMIN_EMAIL = 'programopscentral@nxtwave.in';
        const mainAdmin = await getUserByEmail(ADMIN_EMAIL);

        if (mainAdmin) {
            // 1. In-App Notification
            await createNotification({
                user_id: mainAdmin.id,
                university_id: universityIds[0],
                title,
                message,
                type: 'ACCESS_REQUEST',
                link: '/users',
                source_id: sourceId
            }).catch(() => {});

            // 2. Push Notification (FCM)
            try {
                const tokens = await getUserFcmTokens(mainAdmin.id);
                const uniqueTokens = [...new Set(tokens)];
                if (uniqueTokens.length > 0 && admin.apps.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: { title, body: message },
                        data: { action: 'OPEN_REQUESTS' },
                        tokens: uniqueTokens
                    });
                }
            } catch { /* non-fatal */ }
        }

        // Also notify all ADMIN users for the requested universities
        try {
            for (const univId of universityIds) {
                const admins = await db.query(
                    `SELECT id FROM users WHERE role IN ('ADMIN', 'PROGRAM_OPS') AND university_id = $1 AND is_active = true`,
                    [univId]
                );
                for (const a of admins.rows) {
                    if (a.id === mainAdmin?.id) continue; // already notified above
                    await createNotification({
                        user_id: a.id,
                        university_id: univId,
                        title,
                        message,
                        type: 'ACCESS_REQUEST',
                        link: '/users',
                        source_id: sourceId
                    }).catch(() => {});
                }
            }
        } catch { /* non-fatal */ }

        return json(ar);
    } catch (err: any) {
        console.error('Failed to create access request:', err);
        throw error(500, 'Internal Server Error');
    }
};
