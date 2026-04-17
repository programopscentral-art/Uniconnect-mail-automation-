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

    let allUniversities: Array<{ id: string; name: string }> = [];

    if (role === 'ADMIN' || role === 'PROGRAM_OPS') {
        // Admin/PM: show all universities
        try {
            const res = await db.query(
                `SELECT id, COALESCE(short_name, name) AS name FROM universities ORDER BY name`
            );
            allUniversities = res.rows;
        } catch {}
    } else {
        // Everyone else: show ONLY universities assigned to them.
        // Pull from user_role_assignments (all assigned universities)
        // PLUS their primary university_id from the users table.
        try {
            const res = await db.query(
                `SELECT DISTINCT u.id, COALESCE(u.short_name, u.name) AS name
                 FROM universities u
                 WHERE u.id IN (
                     SELECT DISTINCT ura.university_id
                     FROM user_role_assignments ura
                     WHERE ura.user_id = $1
                 )
                 OR u.id = $2
                 ORDER BY name`,
                [locals.user.id, locals.user.university_id || '00000000-0000-0000-0000-000000000000']
            );
            allUniversities = res.rows;
        } catch {
            // Fallback: if user_role_assignments doesn't exist or query fails,
            // at least show their primary university
            if (locals.user.university_id) {
                try {
                    const res = await db.query(
                        `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE id = $1`,
                        [locals.user.university_id]
                    );
                    allUniversities = res.rows;
                } catch {}
            }
        }

        // If they still have 0 universities (central team with no assignments),
        // give them all universities as a last resort
        if (allUniversities.length === 0) {
            try {
                const res = await db.query(
                    `SELECT id, COALESCE(short_name, name) AS name FROM universities ORDER BY name`
                );
                allUniversities = res.rows;
            } catch {}
        }
    }

    // Auto-select user's primary university, or first in list
    let universityId = locals.user.university_id || null;
    if (universityId && !allUniversities.find(u => u.id === universityId)) {
        // Primary university not in their assigned list (e.g. "Central") — pick first
        universityId = allUniversities[0]?.id || null;
    }
    if (!universityId && allUniversities.length > 0) {
        universityId = allUniversities[0].id;
    }
    const universityName = allUniversities.find(u => u.id === universityId)?.name || '';

    return {
        user: locals.user,
        userRole: role,
        universityId,
        universityName,
        allUniversities
    };
};
