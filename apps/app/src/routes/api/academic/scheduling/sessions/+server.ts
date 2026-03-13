import { SchedulingService, TimetableOpsService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    const sectionId = url.searchParams.get('sectionId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
        throw error(400, 'startDate and endDate are required');
    }

    try {
        // If universityId is provided, fetch all sessions for that week (across all sections)
        if (universityId) {
            const sessions = await TimetableOpsService.getWeekSessions(universityId, startDate, endDate, {
                sectionId: sectionId || undefined
            });
            return json(sessions);
        }

        // Legacy: section-based query
        if (!sectionId) throw error(400, 'sectionId or universityId required');
        const sessions = await SchedulingService.getSectionSchedule(sectionId, new Date(startDate), new Date(endDate));
        return json(sessions);
    } catch (e: any) {
        console.error('[GET /api/academic/scheduling/sessions]', e.message);
        return json([]);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const {
        timetable_version_id, subject_id, faculty_profile_id, classroom_id,
        session_date, slot_start, slot_end, delivery_mode, planned_topic
    } = await request.json();

    if (!timetable_version_id || !subject_id) {
        throw error(400, 'timetable_version_id and subject_id are required');
    }

    try {
        const session = await SchedulingService.addSession({
            timetable_version_id,
            subject_id,
            faculty_profile_id: faculty_profile_id || null,
            classroom_id: classroom_id || null,
            session_date: new Date(session_date),
            slot_start,
            slot_end,
            delivery_mode: delivery_mode || 'PHYSICAL',
            planned_topic
        });
        return json(session);
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/sessions]', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};
