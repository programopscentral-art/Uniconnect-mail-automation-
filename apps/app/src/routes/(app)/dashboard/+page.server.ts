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
    const userUnivs: Array<{ id: string; name?: string; is_team?: boolean }> = (locals.user as any).universities || [];
    const isGlobalRole = ['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string);
    const teamEntry = userUnivs.find(u => u.is_team);

    let universities: any[] = [];
    if (isGlobalRole) {
        // Admins see all universities
        universities = await getAllUniversities();
    } else if (teamEntry) {
        // Team members: resolve universities via team membership
        universities = await getAllUniversities(teamEntry.id);
    } else if (userUnivs.length > 0) {
        // Users directly assigned to universities: show only their assigned ones
        universities = userUnivs.filter(u => !u.is_team).map(u => ({ id: u.id, name: u.name }));
    }

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
