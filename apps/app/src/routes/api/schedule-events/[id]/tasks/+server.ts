import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTasksFromEventChecklist, getScheduleEventById } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const event = await getScheduleEventById(params.id);
    if (!event) throw error(404, 'Event not found');

    const assignees = event.assignees || [];
    const assigneeIds = assignees.map((a: any) => a.id).filter(Boolean);

    if (assigneeIds.length === 0) {
        throw error(400, 'No assignees found for this event. Assign team members first.');
    }

    const tasks = await createTasksFromEventChecklist(params.id, assigneeIds, locals.user.id);

    // Notify assignees about new tasks
    try {
        const { createNotification } = await import('@uniconnect/shared');
        for (const uid of assigneeIds) {
            for (const task of tasks) {
                await createNotification({
                    user_id: uid,
                    university_id: event.university_id,
                    title: 'New Task from Event',
                    message: `You have been assigned a task: "${task.title}"`,
                    type: 'SYSTEM',
                    link: '/task-center',
                    source_id: `event-task-${task.id}-${uid}`
                });
            }
        }
    } catch (e) {
        console.warn('[EVENT_TASKS] Could not notify assignees:', e);
    }

    return json({ tasks, count: tasks.length, success: true });
};
