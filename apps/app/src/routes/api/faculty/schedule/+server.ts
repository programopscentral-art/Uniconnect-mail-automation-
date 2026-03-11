import { json, error } from '@sveltejs/kit';
import { SchedulingService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const dateParam = url.searchParams.get('date');
    const endDateParam = url.searchParams.get('endDate');
    const targetDate = dateParam ?? new Date().toISOString().split('T')[0];
    const view = url.searchParams.get('view'); // 'week' for weekly view

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

        let endDate = endDateParam || targetDate;
        if (view === 'week') {
            // Calculate week end (Sunday)
            const d = new Date(targetDate);
            const dayOfWeek = d.getDay(); // 0=Sun
            const daysToSun = dayOfWeek === 0 ? 6 : 7 - dayOfWeek;
            const weekEnd = new Date(d);
            weekEnd.setDate(d.getDate() + daysToSun);
            // Also adjust start to Monday
            const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() + daysToMon);
            endDate = weekEnd.toISOString().split('T')[0];
            // Use weekStart as the date
            const sessions = await SchedulingService.getFacultySchedule(
                facultyProfileId,
                weekStart.toISOString().split('T')[0],
                endDate
            );
            return json(formatSessions(sessions));
        }

        const sessions = await SchedulingService.getFacultySchedule(facultyProfileId, targetDate, endDate);
        return json(formatSessions(sessions));
    } catch (e: any) {
        console.error('[API:faculty/schedule]', e.message);
        return json([]);
    }
};

function formatSessions(sessions: any[]) {
    return sessions.map((s: any) => ({
        id: s.id,
        session_date: s.session_date,
        subject_name: s.subject_name ?? 'Unknown Subject',
        subject_code: s.subject_code ?? '',
        section_name: s.section_name ?? '—',
        room_name: s.room_name ?? 'TBD',
        building: s.building ?? '',
        slot_start: s.slot_start,
        slot_end: s.slot_end,
        delivery_mode: s.delivery_mode ?? 'PHYSICAL',
        planned_topic: s.planned_topic ?? '',
        session_status: s.session_status ?? 'SCHEDULED',
        faculty_name: s.faculty_name ?? ''
    }));
}
