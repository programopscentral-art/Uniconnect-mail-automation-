import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createScheduleEvent, getScheduleEvents, deleteScheduleEvent, getScheduleEventById, updateScheduleEvent, getUserById, createNotification } from '@uniconnect/shared';
import { addNotificationJob } from '$lib/server/queue';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

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
    const { title, type, description, priority, start_date, due_date, university_id, assignee_ids } = body;

    if (!title) throw error(400, 'Title is required');

    // Security check: University Admin can only create for their university
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && university_id !== locals.user.university_id) {
        throw error(403, 'Forbidden');
    }

    const event = await createScheduleEvent({
        university_id: university_id || locals.user.university_id,
        title,
        type: type || 'EVENT',
        description,
        priority: priority || 'MEDIUM',
        start_date,
        due_date,
        created_by: locals.user.id,
        assignee_ids: assignee_ids || []
    });

    // Send notifications to assignees (non-blocking — don't delay response)
    if (assignee_ids && assignee_ids.length > 0) {
        const otherAssignees = assignee_ids.filter((uid: string) => uid !== locals.user.id);
        if (otherAssignees.length > 0) {
            Promise.all(otherAssignees.map(async (uid: string) => {
                try {
                    const assignedUser = await getUserById(uid);
                    if (!assignedUser) return;
                    await Promise.all([
                        createNotification({
                            user_id: assignedUser.id,
                            university_id: event.university_id,
                            title: 'Event Assigned',
                            message: `You have been assigned to a new event: ${event.title}`,
                            type: 'SYSTEM',
                            link: '/dashboard',
                            source_id: `event-assign-${event.id}-${uid}`
                        }),
                        addNotificationJob({
                            to: assignedUser.email,
                            subject: `New Event Assigned: ${event.title}`,
                            text: `Hi ${assignedUser.name || 'there'},\n\nYou have been assigned to a new event: ${event.title}\nType: ${event.type}\nDescription: ${description || 'No description'}\nDate: ${new Date(start_date).toLocaleDateString()}`,
                            html: `<div><strong>New Event:</strong> ${event.title}<br>Type: ${event.type}</div>`
                        })
                    ]);
                } catch (e: any) {
                    console.error(`[SCHEDULE_EVENTS] Notification error for ${uid}:`, e.message);
                }
            })).catch(e => console.error('[SCHEDULE_EVENTS] Notification batch error:', e.message));
        }
    }

    return json(event);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) throw error(400, 'Event ID required');

    const event = await getScheduleEventById(id);
    if (!event) throw error(404, 'Event not found');

    await updateScheduleEvent(id, updates);
    return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID required');

    await deleteScheduleEvent(id);
    return json({ success: true });
};
