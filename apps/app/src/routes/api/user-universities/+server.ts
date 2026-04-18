/**
 * GET /api/user-universities
 * Returns the current user's assigned universities from user_universities table.
 * Used by the global layout university selector.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    let universities: Array<{ id: string; name: string }> = [];

    // Primary source: user_universities table (same as ops dashboard)
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
        // Fallback: user_universities doesn't exist or is_team column missing
        try {
            const res = await db.query(
                `SELECT DISTINCT u.id, COALESCE(u.short_name, u.name) AS name
                 FROM universities u
                 JOIN user_universities uu ON uu.university_id = u.id
                 WHERE uu.user_id = $1
                 ORDER BY name`,
                [locals.user.id]
            );
            universities = res.rows;
        } catch {
            // Last resort: just their primary university
            if (locals.user.university_id) {
                try {
                    const res = await db.query(
                        `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE id = $1`,
                        [locals.user.university_id]
                    );
                    universities = res.rows;
                } catch {}
            }
        }
    }

    // If ADMIN or PROGRAM_OPS and has 0 results, give all
    if (universities.length === 0 && (locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS')) {
        try {
            const res = await db.query(
                `SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE is_team = false ORDER BY name`
            );
            universities = res.rows;
        } catch {
            try {
                const res = await db.query(`SELECT id, name FROM universities ORDER BY name`);
                universities = res.rows;
            } catch {}
        }
    }

    return json({ universities });
};
