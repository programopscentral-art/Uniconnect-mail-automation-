import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = locals.user.permissions || [];
    if (role !== 'ADMIN' && role !== 'PROGRAM_OPS' && !perms.includes('faculty-attendance')) {
        throw error(403, 'Access denied.');
    }

    let allUniversities: Array<{ id: string; name: string }> = [];

    // Use user_universities table — this is the source of truth for
    // which universities each user is assigned to. Same as ops dashboard.
    try {
        const res = await db.query(
            `SELECT DISTINCT u.id, COALESCE(u.short_name, u.name) AS name
             FROM universities u
             JOIN user_universities uu ON uu.university_id = u.id
             WHERE uu.user_id = $1 AND u.is_team = false
             ORDER BY name`,
            [locals.user.id]
        );
        allUniversities = res.rows;
    } catch {
        // Fallback if user_universities or is_team column doesn't exist
        try {
            const res = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities ORDER BY name`);
            allUniversities = res.rows;
        } catch {
            try {
                const res = await db.query(`SELECT id, name FROM universities ORDER BY name`);
                allUniversities = res.rows;
            } catch {}
        }
    }

    // If user has 0 assigned universities (shouldn't happen but safety net),
    // fall back to all operational universities
    if (allUniversities.length === 0) {
        try {
            const res = await db.query(
                `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE is_team = false ORDER BY name`
            );
            allUniversities = res.rows;
        } catch {
            try {
                const res = await db.query(`SELECT id, name FROM universities ORDER BY name`);
                allUniversities = res.rows;
            } catch {}
        }
    }

    // Auto-select user's primary university if in list, else first
    let universityId = locals.user.university_id || null;
    if (universityId && !allUniversities.find(u => u.id === universityId)) {
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
