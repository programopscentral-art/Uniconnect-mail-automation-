import { getAllUniversities, db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const urlUnivId = url.searchParams.get('universityId');

    let universityId: string | null = null;
    if (urlUnivId === 'all' || urlUnivId === '') {
        // User explicitly selected "All Universities"
        universityId = null;
    } else if (urlUnivId) {
        // User selected a specific university
        universityId = urlUnivId;
    } else {
        // First load — no param. Default to primary university.
        universityId = locals.user.university_id || null;
    }

    // Load universities for the filter dropdown
    const globalRoles = ['ADMIN', 'PROGRAM_OPS', 'CMA', 'CMA_MANAGER'];
    const isGlobalRole = globalRoles.includes(locals.user.role as string);

    let universities: any[] = [];
    if (isGlobalRole) {
        universities = await getAllUniversities();
    } else {
        // Use user_universities for assigned universities
        try {
            const res = await db.query(
                `SELECT DISTINCT u.id, COALESCE(u.short_name, u.name) AS name
                 FROM universities u
                 JOIN user_universities uu ON uu.university_id = u.id
                 WHERE uu.user_id = $1 AND u.is_team = false
                 ORDER BY name`,
                [locals.user.id]
            );
            universities = res.rows;
        } catch {
            const userUnivs: Array<{ id: string; name?: string; is_team?: boolean }> = (locals.user as any).universities || [];
            universities = userUnivs.filter(u => !u.is_team).map(u => ({ id: u.id, name: u.name }));
        }
        // Fallback: if 0 results, give all
        if (universities.length === 0) {
            universities = await getAllUniversities();
        }
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
