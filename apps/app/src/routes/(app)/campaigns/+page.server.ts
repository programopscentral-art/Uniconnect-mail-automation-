import { getCampaigns, db } from '@uniconnect/shared';
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

    // Parallel fetch: Lean universities list + filtered campaigns
    const [campaigns, universitiesRes] = await Promise.all([
        getCampaigns(universityId || undefined),
        isGlobal
            ? db.query('SELECT id, name FROM universities ORDER BY name ASC')
            : Promise.resolve({ rows: [] })
    ]);

    return {
        campaigns,
        universities: universitiesRes.rows,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userPermissions: locals.user.permissions || []
    };
};
