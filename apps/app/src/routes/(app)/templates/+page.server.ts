import { getTemplates, getAllUniversities, db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    // Respect the dropdown selection from the URL. Only fall back to
    // the user's primary university if nothing was explicitly selected.
    let universityId = url.searchParams.get('universityId');
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    const isGlobal = locals.user.permissions?.includes('universities');
    let universities: any[] = [];
    if (isGlobal) {
        universities = await getAllUniversities();
    } else {
        // Fetch user's assigned universities from user_universities
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
            // Fallback to user's primary university
            if (locals.user.university_id) {
                universities = (locals.user as any).universities?.filter((u: any) => !u.is_team) || [];
            }
        }
    }

    const templates = await getTemplates(universityId || undefined);

    return {
        templates,
        universities,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userPermissions: locals.user.permissions || [],
        user: locals.user
    };
};
