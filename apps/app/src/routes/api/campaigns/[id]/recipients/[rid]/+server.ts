import { db, updateCampaignRecipientEmail, getCampaignById } from '@uniconnect/shared';
import { sendToRecipient } from '$lib/server/campaign-sender';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);

    const campaignId = params.id;
    const recipientId = params.rid;
    const { email } = await request.json();

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
        const updated = await updateCampaignRecipientEmail(recipientId, email);

        // Reset campaign status to IN_PROGRESS so it polls and shows STOP button
        await db.query(
            `UPDATE campaigns SET status = 'IN_PROGRESS', failed_count = GREATEST(0, failed_count - 1), updated_at = NOW() WHERE id = $1`,
            [campaignId]
        );

        // Also update the student record to ensure future campaigns use the correct email
        if (updated.student_id) {
            await db.query(
                'UPDATE students SET email = $1 WHERE id = $2',
                [email.toLowerCase().trim(), updated.student_id]
            );
        }

        // Fetch student name and external_id for the job (kept for compatibility in sender)

        // TRIGGER IMMEDIATE SEND
        // We only trigger if the campaign is already active (IN_PROGRESS) or was COMPLETED (re-sending to corrected)
        if (['IN_PROGRESS', 'COMPLETED', 'FAILED'].includes(campaign.status)) {
            console.log(`[RECIPIENT_PATCH] Triggering immediate send for ${recipientId}`);
            // Fire and forget send so response is fast
            sendToRecipient(campaignId, updated.id).catch(err => {
                console.error(`[RECIPIENT_PATCH] Background send failed for ${recipientId}:`, err);
            });
        }

        return json({ success: true, recipient: updated, triggered: true });
    } catch (err: any) {
        console.error('[RECIPIENT_PATCH] Error:', err);
        throw error(500, err.message);
    }
};
