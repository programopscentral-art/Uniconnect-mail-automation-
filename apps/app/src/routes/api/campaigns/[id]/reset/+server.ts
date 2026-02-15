import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    try {
        // DELETE ALL RECIPIENTS: This allows a clean start to fix mismatched counts
        await db.query(`DELETE FROM campaign_recipients WHERE campaign_id = $1`, [campaignId]);

        // Reset campaign status and counts
        await db.query(
            `UPDATE campaigns 
             SET status = 'DRAFT', 
                 started_at = NULL, 
                 completed_at = NULL, 
                 sent_count = 0, 
                 failed_count = 0, 
                 total_recipients = 0 
             WHERE id = $1`,
            [campaignId]
        );

        return json({ success: true, message: 'Campaign reset successfully' });
    } catch (err: any) {
        console.error(`[RESET_ERROR] Failed for campaign ${campaignId}:`, err);
        return json({ success: false, message: err.message }, { status: 500 });
    }
};
