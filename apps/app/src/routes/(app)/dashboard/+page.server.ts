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

    // Load universities for the filter dropdown
    const userUnivs: Array<{ id: string; is_team?: boolean }> = (locals.user as any).universities || [];
    const hasMultipleUnivs = userUnivs.length > 1;
    const canViewUniversities = ['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS', 'BOA', 'CMA', 'CMA_MANAGER', 'SET_REVIEWER', 'UNIVERSITY_OPERATOR', 'SUPPORT', 'STAKEHOLDER'].includes(locals.user.role as string) || hasMultipleUnivs;

    // For the dropdown: use the user's team entry (if any) to resolve visible universities.
    // getAllUniversities(teamId) finds real universities via team members' junction entries.
    // Always use team ID (not the currently selected university) so the dropdown stays stable.
    const teamEntry = userUnivs.find(u => u.is_team);
    const universities = canViewUniversities ? await getAllUniversities(teamEntry?.id) : [];

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
