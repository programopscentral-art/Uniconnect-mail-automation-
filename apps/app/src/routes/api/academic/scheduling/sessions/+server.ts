import { SchedulingService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const sectionId = url.searchParams.get('sectionId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!sectionId || !startDate || !endDate) {
        throw error(400, 'sectionId, startDate, and endDate are required');
    }

    const sessions = await SchedulingService.getSectionSchedule(sectionId, new Date(startDate), new Date(endDate));
    return json(sessions);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const {
        timetable_version_id, subject_id, faculty_profile_id, classroom_id,
        session_date, slot_start, slot_end, delivery_mode
    } = await request.json();

    if (!timetable_version_id || !subject_id || !faculty_profile_id || !classroom_id) {
        throw error(400, 'All core session fields are required');
    }

    const session = await SchedulingService.addSession({
        timetable_version_id, subject_id, faculty_profile_id, classroom_id,
        session_date: new Date(session_date), slot_start, slot_end, delivery_mode: delivery_mode || 'PHYSICAL'
    });
    return json(session);
};
