import { deleteCampaign, getCampaignById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

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
