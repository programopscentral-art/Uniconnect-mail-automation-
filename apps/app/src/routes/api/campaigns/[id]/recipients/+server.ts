import { getCampaignRecipients, getCampaignById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    // RBAC
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    const recipients = await getCampaignRecipients(campaignId);
    console.log(`[API] Found ${recipients.length} recipients for campaign ${campaignId}`);
    return json(recipients);
};
