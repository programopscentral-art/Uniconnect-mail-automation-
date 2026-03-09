import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ locals, url }) => {
    // 1. Get user context (assuming locals.user has the authenticated user's ID)
    // For demo/dev purposes, we'll use a mocked ID if not available
    const userId = locals.user?.id || 'm-mock-faculty-id';

    try {
        // Fetch the faculty profile associated with this user
        const profileRes = await db.query(
            'SELECT id FROM faculty_profiles WHERE user_id = $1',
            [userId]
        );

        if (profileRes.rows.length === 0) {
            // Return empty or error for non-faculty users
            return json([]);
        }

        const facultyProfileId = profileRes.rows[0].id;

        // Fetch upcoming active sessions
        const sessionsRes = await db.query(
            `SELECT ts.*, s.name as subject_name, sec.name as section_name, c.name as room_code
             FROM timetable_sessions ts
             INNER JOIN subjects s ON ts.subject_id = s.id
             INNER JOIN sections sec ON ts.section_id = sec.id
             INNER JOIN classrooms c ON ts.classroom_id = c.id
             WHERE ts.faculty_profile_id = $1 AND ts.status = 'ACTIVE'
             ORDER BY ts.session_date ASC, ts.slot_start ASC
             LIMIT 20`,
            [facultyProfileId]
        );

        return json(sessionsRes.rows);
    } catch (err: any) {
        console.error('Faculty schedule fetch error:', err);
        return json({ error: err.message }, { status: 500 });
    }
}
