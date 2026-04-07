import { getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');

    // AUTO-SCOPE: If no universityId is selected, default to the user's university
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    // Only load universities list (lightweight) for the filter dropdown
    const effectiveUniversityId = (universityId && universityId !== '') ? universityId : undefined;
    const hasMultipleUnivs = (locals.user as any).universities?.length > 1;
    const canViewUniversities = ['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS', 'BOA', 'CMA', 'CMA_MANAGER', 'SET_REVIEWER', 'UNIVERSITY_OPERATOR', 'SUPPORT', 'STAKEHOLDER'].includes(locals.user.role as string) || hasMultipleUnivs;
    const universities = canViewUniversities ? await getAllUniversities(effectiveUniversityId) : [];

    return {
        universities,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userId: locals.user.id,
        userName: locals.user.name,
        defaultUniversityId: locals.user.university_id,
        userPermissions: locals.user.permissions || [],
        user: locals.user
    };
};
