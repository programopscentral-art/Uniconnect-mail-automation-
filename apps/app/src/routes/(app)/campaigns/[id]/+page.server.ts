import { getCampaignById, getStudentsCount } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const campaign = await getCampaignById(params.id);
    if (!campaign) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // Get available student count for this university (shown before campaign starts)
    const availableStudents = await getStudentsCount(campaign.university_id);

    return { campaign, availableStudents };
};
