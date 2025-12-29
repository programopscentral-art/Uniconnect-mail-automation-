import { getTasks, createTask, updateTask, getUserById, deleteTask, getAdmins, createNotification } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { addNotificationJob } from '$lib/server/queue';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const assigned_to = url.searchParams.get('assigned_to') || undefined;
    let university_id = url.searchParams.get('university_id') || undefined;
    const status = url.searchParams.get('status') as any || undefined;

    // Strict Multi-Tenant Enforcement
    const isGlobalAdmin = (locals.user.role as any) === 'ADMIN' || (locals.user.role as any) === 'PROGRAM_OPS';
    if (!isGlobalAdmin) {
        university_id = locals.user.university_id || undefined;
        if (!university_id) {
            // User not in a university and not global admin? restricted to empty
            return json([]);
        }
    }

    const tasks = await getTasks({ assigned_to, university_id, status });
    return json(tasks);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    // ... existing POST ...
    if (!locals.user) throw error(401);
    const data = await request.json();
    if (!data.title) throw error(400, 'Title required');

    // Permission Check
    const isGlobalAdmin = (locals.user.role as any) === 'ADMIN' || (locals.user.role as any) === 'PROGRAM_OPS';
    const isUnivAdmin = (locals.user.role as any) === 'UNIVERSITY_OPERATOR';

    // 1. Force University ID for university-scoped roles
    if (!isGlobalAdmin) {
        data.university_id = locals.user.university_id;
    }

    // 2. Assignment Restrictions
    if (data.assigned_to && data.assigned_to !== locals.user.id) {
        if (!isGlobalAdmin && !isUnivAdmin) {
            // Regular team members can ONLY create tasks for themselves
            data.assigned_to = locals.user.id;
        } else if (isUnivAdmin) {
            // Univ Admins can ONLY assign to members of their own university
            const targetUser = await getUserById(data.assigned_to);
            if (!targetUser || targetUser.university_id !== locals.user.university_id) {
                // If invalid target, fallback to self or error
                throw error(403, 'University Admins can only assign tasks to members of their own university.');
            }
        }
    } else if (!data.assigned_to) {
        // Default to self if unassigned (for team members) or stay NULL if it's a generic task
        if (!isGlobalAdmin && !isUnivAdmin) {
            data.assigned_to = locals.user.id;
        }
    }

    const task = await createTask({ ...data, assigned_by: locals.user.id });
    if (task.assigned_to && task.assigned_to !== locals.user.id) {
        const assignedUser = await getUserById(task.assigned_to);
        if (assignedUser) {
            // Internal Notification
            await createNotification({
                user_id: assignedUser.id,
                university_id: task.university_id,
                title: 'Task Assigned',
                message: `You have been assigned a new task: ${task.title}`,
                type: 'SYSTEM',
                link: '/tasks'
            });

            // Email Notification (Optional/Job)
            await addNotificationJob({
                to: assignedUser.email,
                subject: `New Task Assigned: ${task.title}`,
                text: `Hi ${assignedUser.name || 'there'},\n\nYou have been assigned a new task: ${task.title}\nDescription: ${task.description || 'No description'}\nDue Date: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}`,
                html: `<div>New Task: ${task.title}</div>`
            });
        }
    }
    return json(task);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    // ... existing PATCH ...
    if (!locals.user) throw error(401);
    const data = await request.json();
    const { id, ...updates } = data;
    if (!id) throw error(400, 'Task ID required');
    await updateTask(id, updates);
    return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    try {
        if (!locals.user) throw error(401);
        const id = url.searchParams.get('id');
        if (!id) throw error(400, 'Task ID required');

        console.log('[API_TASKS] Deleting Task ID:', id);
        await deleteTask(id);
        console.log('[API_TASKS] Deleted successfully');
        return json({ success: true });
    } catch (err) {
        console.error('[API_TASKS] DELETE Error:', err);
        throw error(500, 'Failed to delete task');
    }
};
