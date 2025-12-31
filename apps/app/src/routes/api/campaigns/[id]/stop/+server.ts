import { db, getCampaignById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    // RBAC
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // Only allow stopping if it's currently IN_PROGRESS, SCHEDULED, or QUEUED
    if (!['IN_PROGRESS', 'SCHEDULED', 'QUEUED'].includes(campaign.status)) {
        throw error(400, `Cannot stop a campaign with status: ${campaign.status}`);
    }

    await db.query(
        `UPDATE campaigns SET status = 'STOPPED', updated_at = NOW() WHERE id = $1`,
        [campaignId]
    );

    return json({ success: true, message: 'Campaign stopped successfully' });
};
