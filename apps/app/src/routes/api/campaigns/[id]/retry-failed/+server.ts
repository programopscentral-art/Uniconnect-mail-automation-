import { db, getCampaignById, getStudents, getTemplateById, getCampaignRecipients } from '@uniconnect/shared';
import { sendToRecipient } from '$lib/server/campaign-sender';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    // 1. Get failed recipients
    const result = await db.query(
        `SELECT r.*, s.name as student_name, s.external_id, s.metadata 
         FROM campaign_recipients r 
         JOIN students s ON r.student_id = s.id 
         WHERE r.campaign_id = $1 AND r.status = 'FAILED'`,
        [campaignId]
    );

    const failedRecipients = result.rows;

    if (failedRecipients.length === 0) {
        return json({ success: true, count: 0, message: 'No failed recipients found' });
    }

    // 2. Reset status in DB
    await db.query(
        `UPDATE campaign_recipients SET status = 'QUEUED', error_message = NULL WHERE campaign_id = $1 AND status = 'FAILED'`,
        [campaignId]
    );

    // 3. Reset campaign stats and set status back to IN_PROGRESS
    console.log(`[RETRY] Resetting failed_count and setting status to IN_PROGRESS for campaign ${campaignId}`);
    await db.query(
        `UPDATE campaigns SET failed_count = 0, status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
        [campaignId]
    );

    // 4. Trigger Background Sending for failed ones
    (async () => {
        console.log(`[RETRY] Starting background send for ${failedRecipients.length} recipients...`);
        for (const r of failedRecipients) {
            await sendToRecipient(campaignId, r.id);
            // Small stagger
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    })();

    return json({ success: true, count: failedRecipients.length });
};
