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

    let universityId = locals.user.university_id || null;
    let universityName = '';

    // For non-admin users, resolve their university name so the UI can show it
    if (universityId) {
        try {
            const res = await db.query(
                `SELECT COALESCE(short_name, name) AS name FROM universities WHERE id = $1`,
                [universityId]
            );
            universityName = res.rows[0]?.name || '';
        } catch {}
    }

    // Also fetch all universities for admin/PM dropdown
    let allUniversities: Array<{ id: string; name: string }> = [];
    if (role === 'ADMIN' || role === 'PROGRAM_OPS') {
        try {
            const res = await db.query(
                `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE is_team = false ORDER BY name`
            );
            allUniversities = res.rows;
        } catch {}
    }

    return {
        user: locals.user,
        userRole: role,
        universityId,
        universityName,
        allUniversities
    };
};
