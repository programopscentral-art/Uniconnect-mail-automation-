import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    // Verify the caller is faculty and owns this session (or is admin)
    if (locals.user.role === 'FACULTY') {
        const profileRes = await db.query(
            `SELECT id FROM faculty_profiles WHERE user_id = $1 LIMIT 1`,
            [locals.user.id]
        );
        if (!profileRes.rows[0]) throw error(403, 'Faculty profile not found');

        const sessionRes = await db.query(
            `SELECT id FROM academic_sessions WHERE id = $1 AND faculty_id = $2`,
            [params.id, profileRes.rows[0].id]
        );
        if (!sessionRes.rows[0]) throw error(403, 'Not your session');
    } else if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const result = await db.query(
        `UPDATE academic_sessions
         SET status = 'COMPLETED', updated_at = NOW()
         WHERE id = $1
         RETURNING id, status`,
        [params.id]
    );

    if (!result.rows[0]) throw error(404, 'Session not found');
    return json(result.rows[0]);
};
