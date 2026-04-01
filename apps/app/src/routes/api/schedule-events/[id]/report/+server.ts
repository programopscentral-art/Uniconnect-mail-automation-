import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEventReport, getEventReport, getScheduleEventById } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const report = await getEventReport(params.id);
    return json({ report });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const event = await getScheduleEventById(params.id);
    if (!event) throw error(404, 'Event not found');

    // Validate required fields
    const required = ['event_title', 'campus_name', 'event_category'];
    for (const field of required) {
        if (!body[field]?.trim()) {
            throw error(400, `${field.replace(/_/g, ' ')} is required`);
        }
    }

    const report = await createEventReport({
        ...body,
        event_id: params.id,
        university_id: event.university_id,
        submitted_by: locals.user.id,
    });

    // Notify student engagement team
    try {
        const { NotificationService } = await import('@uniconnect/shared');
        if (NotificationService?.notifyBulk) {
            await NotificationService.notifyBulk(
                event.university_id,
                'SE',
                'Event Report Submitted',
                `Report for "${event.title}" has been submitted by ${locals.user.name || 'a team member'}.`,
                '/dashboard'
            );
        }
    } catch (e) {
        console.warn('[EVENT_REPORT] Could not notify SE team:', e);
    }

    return json({ report, success: true });
};
