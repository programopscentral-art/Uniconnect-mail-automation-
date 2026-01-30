import { db, updateCampaignRecipientEmail, getCampaignById } from '@uniconnect/shared';
import { sendToRecipient } from '$lib/server/campaign-sender';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);

    const campaignId = params.id;
    const recipientId = params.rid;
    const { email, name, metadata } = await request.json();

    if (!email || !email.includes('@')) {
        throw error(400, 'Invalid email address');
    }

    // RBAC: Check if user has access to campaign
    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404, 'Campaign not found');

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403, 'Unauthorized');
    }

    try {
        console.log(`[RECIPIENT_PATCH] Starting update for recipient: ${recipientId}, campaign: ${campaignId}`);
        const client = await db.pool.connect();
        let updatedRecipient;

        try {
            await client.query('BEGIN');
            console.log(`[RECIPIENT_PATCH] Transaction started`);

            // 1. Update Recipient Table (campaign context)
            const { rows: recipientRows } = await client.query(
                `UPDATE campaign_recipients 
                 SET to_email = $1, status = 'QUEUED', error_message = NULL, updated_at = NOW() 
                 WHERE id = $2 RETURNING *`,
                [email.toLowerCase().trim(), recipientId]
            );
            updatedRecipient = recipientRows[0];
            console.log(`[RECIPIENT_PATCH] Recipient updated. Found: ${!!updatedRecipient}`);

            if (!updatedRecipient) {
                throw new Error(`Recipient with ID ${recipientId} not found in campaign ${campaignId}`);
            }

            // 2. Update Student Table (Global record) - ATOMIC SYNC
            if (updatedRecipient.student_id) {
                console.log(`[RECIPIENT_PATCH] Updating student: ${updatedRecipient.student_id}`);
                const metaJson = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
                await client.query(
                    `UPDATE students SET email = $1, name = $2, metadata = $3, updated_at = NOW() WHERE id = $4`,
                    [email.toLowerCase().trim(), name, metaJson, updatedRecipient.student_id]
                );
            }

            // 3. Reset campaign status to IN_PROGRESS
            await client.query(
                `UPDATE campaigns SET status = 'IN_PROGRESS', failed_count = GREATEST(0, failed_count - 1), updated_at = NOW() WHERE id = $1`,
                [campaignId]
            );

            await client.query('COMMIT');
            console.log(`[RECIPIENT_PATCH] Transaction committed successfully`);
        } catch (err: any) {
            console.error(`[RECIPIENT_PATCH] Transaction error:`, err);
            await client.query('ROLLBACK').catch(e => console.error('[RECIPIENT_PATCH] Rollback failed:', e));
            throw err;
        } finally {
            client.release();
        }

        // 4. TRIGGER IMMEDIATE SEND with fresh data (After COMMIT to ensure visibility)
        if (['IN_PROGRESS', 'COMPLETED', 'FAILED', 'STOPPED'].includes(campaign.status)) {
            console.log(`[RECIPIENT_PATCH] Triggering immediate resend for ${recipientId}`);

            // Log if we are missing any critical data
            if (!email || !name) {
                console.warn(`[RECIPIENT_PATCH] Missing email or name for resend. Email: ${email}, Name: ${name}`);
            }

            sendToRecipient(campaignId, recipientId).then(result => {
                console.log(`[RECIPIENT_PATCH] Async Resend Result for ${recipientId}:`, result);
            }).catch(err => {
                console.error(`[RECIPIENT_PATCH] Async Resend Failed for ${recipientId}:`, err);
            });
        }

        return json({ success: true, recipient: updatedRecipient, triggered: true });
    } catch (err: any) {
        console.error('[RECIPIENT_PATCH] Top-level Error:', {
            message: err.message,
            code: (err as any).code,
            detail: (err as any).detail,
            stack: err.stack
        });
        throw error(500, { message: err.message || 'Internal Server Error' });
    }
};
