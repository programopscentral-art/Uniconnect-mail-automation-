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
    let allUniversities: Array<{ id: string; name: string }> = [];

    if (role === 'ADMIN' || role === 'PROGRAM_OPS') {
        // Admin/PM: all universities
        try {
            const res = await db.query(
                `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE is_team = false ORDER BY name`
            );
            allUniversities = res.rows;
        } catch {}
    } else {
        // BOA / other roles: get universities they're assigned to
        // via user_role_assignments + their primary university_id
        const univIds = new Set<string>();
        if (universityId) univIds.add(universityId);

        try {
            const res = await db.query(
                `SELECT DISTINCT ura.university_id
                 FROM user_role_assignments ura
                 WHERE ura.user_id = $1 AND ura.university_id IS NOT NULL`,
                [locals.user.id]
            );
            for (const r of res.rows) {
                if (r.university_id) univIds.add(r.university_id);
            }
        } catch {}

        if (univIds.size > 0) {
            try {
                const res = await db.query(
                    `SELECT id, COALESCE(short_name, name) AS name
                     FROM universities WHERE id = ANY($1) ORDER BY name`,
                    [Array.from(univIds)]
                );
                allUniversities = res.rows;
            } catch {}

            // Default to first if primary not set
            if (!universityId && allUniversities.length > 0) {
                universityId = allUniversities[0].id;
            }
        }
    }

    // Resolve current university name
    if (universityId) {
        const match = allUniversities.find(u => u.id === universityId);
        universityName = match?.name || '';
        if (!universityName) {
            try {
                const res = await db.query(
                    `SELECT COALESCE(short_name, name) AS name FROM universities WHERE id = $1`,
                    [universityId]
                );
                universityName = res.rows[0]?.name || '';
            } catch {}
        }
    }

    return {
        user: locals.user,
        userRole: role,
        universityId,
        universityName,
        allUniversities
    };
};
