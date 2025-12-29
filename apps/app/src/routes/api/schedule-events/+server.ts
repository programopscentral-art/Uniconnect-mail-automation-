import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createScheduleEvent, getScheduleEvents, deleteScheduleEvent } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    // For Schedule Events (Holidays, Exams), we filter by university
    const university_id = url.searchParams.get('university_id') || locals.user.university_id;
    if (!university_id) {
        return json([]);
    }

    const events = await getScheduleEvents(university_id);
    return json(events);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const { title, type, description, start_date, due_date, university_id } = body;

    // Security check: University Admin can only create for their university
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && university_id !== locals.user.university_id) {
        throw error(403, 'Forbidden');
    }

    const event = await createScheduleEvent({
        university_id: university_id || locals.user.university_id,
        title,
        type,
        description,
        start_date,
        due_date,
        created_by: locals.user.id
    });

    return json(event);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID required');

    // Simple delete for now
    await deleteScheduleEvent(id);
    return json({ success: true });
};
