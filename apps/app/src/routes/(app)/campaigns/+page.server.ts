import { getCampaigns, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    const [campaigns, universities] = await Promise.all([
        universityId ? getCampaigns(universityId) : Promise.resolve([]),
        locals.user.role === 'ADMIN' ? getAllUniversities() : Promise.resolve([])
    ]);

    return {
        campaigns,
        universities,
        selectedUniversityId: universityId,
        userRole: locals.user.role
    };
};
