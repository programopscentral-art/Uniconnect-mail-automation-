import { getCampaigns, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    const isGlobal = locals.user.permissions?.includes('universities');
    if (!isGlobal && locals.user.university_id) {
        universityId = locals.user.university_id;
    } else if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    const campaigns = await getCampaigns(universityId || undefined);

    return {
        campaigns,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userPermissions: locals.user.permissions || []
    };
};
