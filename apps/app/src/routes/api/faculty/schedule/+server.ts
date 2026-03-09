import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const dateParam = url.searchParams.get('date');
    const targetDate = dateParam ?? new Date().toISOString().split('T')[0];

    try {
        // Resolve faculty profile for this user
        const profileRes = await db.query(
            `SELECT id FROM faculty_profiles WHERE user_id = $1`,
            [locals.user.id]
        );

        if (profileRes.rows.length === 0) {
            return json([]);
        }

        const facultyProfileId = profileRes.rows[0].id;

        // Fetch today's sessions from academic_sessions (has university_id, start_time/end_time)
        const sessionsRes = await db.query(
            `SELECT
                s.id,
                s.start_time,
                s.end_time,
                s.status,
                s.session_type,
                sub.name  AS subject_name,
                sub.code  AS subject_code,
                sec.name  AS section_name,
                cr.name   AS room_name,
                cr.building
             FROM academic_sessions s
             LEFT JOIN subjects   sub ON s.subject_id   = sub.id
             LEFT JOIN sections   sec ON s.section_id   = sec.id
             LEFT JOIN classrooms cr  ON s.classroom_id = cr.id
             WHERE s.faculty_id = $1
               AND DATE(s.start_time) = $2
             ORDER BY s.start_time ASC`,
            [facultyProfileId, targetDate]
        );

        const sessions = sessionsRes.rows.map((s: any) => ({
            id: s.id,
            subject_name: s.subject_name ?? 'Unknown Subject',
            subject_code: s.subject_code ?? '',
            section_name: s.section_name ?? '—',
            room_code: [s.room_name, s.building].filter(Boolean).join(', ') || 'TBD',
            start_time: new Date(s.start_time).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
            }),
            end_time: new Date(s.end_time).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
            }),
            status: s.status ?? 'SCHEDULED',
            session_type: s.session_type ?? 'LECTURE'
        }));

        return json(sessions);

    } catch (e: any) {
        console.error('[API:faculty/schedule]', e.message);
        return json([]);
    }
};
