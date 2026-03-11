import { SchedulingService, db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    // Verify the caller is faculty and owns this session (or is admin/ops)
    if (locals.user.role === 'FACULTY') {
        const profileRes = await db.query(
            `SELECT id FROM faculty_profiles WHERE user_id = $1 LIMIT 1`,
            [locals.user.id]
        );
        if (!profileRes.rows[0]) throw error(403, 'Faculty profile not found');

        const sessionRes = await db.query(
            `SELECT id FROM timetable_sessions WHERE id = $1 AND faculty_profile_id = $2`,
            [params.id, profileRes.rows[0].id]
        );
        if (!sessionRes.rows[0]) throw error(403, 'Not your session');
    } else if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role)) {
        throw error(403, 'Forbidden');
    }

    let notes: string | undefined;
    try {
        const body = await request.json();
        notes = body.notes;
    } catch {}

    try {
        await SchedulingService.markSessionConducted(params.id, locals.user.id, notes);
        return json({ id: params.id, session_status: 'COMPLETED' });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
