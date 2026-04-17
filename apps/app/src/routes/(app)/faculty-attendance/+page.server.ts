import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = locals.user.permissions || [];
    if (role !== 'ADMIN' && role !== 'PROGRAM_OPS' && !perms.includes('faculty-attendance')) {
        throw error(403, 'Access denied. Ask your admin to enable Faculty Attendance for your account.');
    }

    // Fetch ALL universities for the dropdown. The page is already
    // permission-gated — if someone can see it, they can mark attendance
    // for any university. No need for complex role-based filtering.
    let allUniversities: Array<{ id: string; name: string }> = [];
    try {
        const res = await db.query(
            `SELECT id, COALESCE(short_name, name) AS name
             FROM universities
             ORDER BY name`
        );
        allUniversities = res.rows;
    } catch {}

    // Auto-select the user's primary university if they have one
    let universityId = locals.user.university_id || null;
    let universityName = '';

    // If the user's primary university is in the list, use it.
    // Otherwise default to the first university.
    if (universityId) {
        const match = allUniversities.find(u => u.id === universityId);
        universityName = match?.name || '';
    }
    if (!universityId && allUniversities.length > 0) {
        universityId = allUniversities[0].id;
        universityName = allUniversities[0].name;
    }

    return {
        user: locals.user,
        userRole: role,
        universityId,
        universityName,
        allUniversities
    };
};
