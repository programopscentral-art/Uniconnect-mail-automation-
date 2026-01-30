import { db, deleteCampaign, getCampaignById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404, 'Campaign not found');

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // Get current statistics
    const statsResult = await db.query(
        `SELECT 
            status, 
            COUNT(*) as count 
         FROM campaign_recipients 
         WHERE campaign_id = $1 
         GROUP BY status`,
        [campaignId]
    );

    const stats: Record<string, number> = {
        PENDING: 0,
        QUEUED: 0,
        SENT: 0,
        FAILED: 0,
        OPENED: 0,
        ACKNOWLEDGED: 0
    };

    statsResult.rows.forEach(row => {
        if (stats.hasOwnProperty(row.status)) {
            stats[row.status] = parseInt(row.count);
        }
    });

    return json({
        ...campaign,
        ...stats
    });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404, 'Campaign not found');

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // Only allow deleting DRAFT or FAILED campaigns for safety, or ADMIN override
    if (campaign.status !== 'DRAFT' && campaign.status !== 'FAILED' && locals.user.role !== 'ADMIN') {
        throw error(400, 'Only Draft or Failed campaigns can be deleted');
    }

    try {
        await deleteCampaign(campaignId);
        return json({ success: true });
    } catch (e: any) {
        console.error('Delete Campaign Error:', e);
        throw error(500, 'Failed to delete campaign');
    }
};
