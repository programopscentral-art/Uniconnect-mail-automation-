import { getTasks, createTask, updateTask, getUserById, deleteTask, getAdmins, createNotification, getTaskById } from '@uniconnect/shared';
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
    const activeUniv = (locals.user as any).universities?.find((u: any) => u.id === locals.user!.university_id);
    const isCentralBOA = locals.user!.role === 'BOA' && (!locals.user!.university_id || activeUniv?.is_team);

    if (!isGlobalAdmin && !isCentralBOA) {
        data.university_id = locals.user.university_id;
    }

    // 2. Assignment Restrictions
    const assignee_ids = data.assignee_ids || [];
    const canAssignToOthers = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER'].includes(locals.user.role as string) || isCentralBOA;

    if (!canAssignToOthers) {
        // Restricted regional BOA roles can only assign to themselves
        data.assignee_ids = [locals.user.id];
    } else if (assignee_ids.length > 0) {
        if (isUnivAdmin) {
            // Univ Admins can ONLY assign to members of their own university
            for (const uid of assignee_ids) {
                const targetUser = await getUserById(uid);
                if (!targetUser || targetUser.university_id !== locals.user.university_id) {
                    throw error(403, `University Admins can only assign tasks to members of their own university. Check user ID: ${uid}`);
                }
            }
        }
    } else {
        // Default to self if unassigned
        data.assignee_ids = [locals.user.id];
    }

    const task = await createTask({ ...data, assigned_by: locals.user.id });

    // Notifications for all assignees
    for (const uid of task.assignee_ids) {
        if (uid === locals.user.id) continue;
        const assignedUser = await getUserById(uid);
        if (assignedUser) {
            await createNotification({
                user_id: assignedUser.id,
                university_id: task.university_id,
                title: 'Task Assigned',
                message: `You have been assigned a new task: ${task.title}`,
                type: 'SYSTEM',
                link: '/tasks'
            });

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

    // Permission Check for Updates
    const task = await getTaskById(id);
    if (!task) throw error(404, 'Task not found');

    const isGlobalAdmin = ['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role as string);
    const isAssigner = task.assigned_by === locals.user?.id;
    const isAssignee = task.assignee_ids.includes(locals.user?.id || '');

    // Existing role-based permission for "Assigned Team" / "Institutions" logic
    const activeUniv = (locals.user as any).universities?.find((u: any) => u.id === locals.user!.university_id);
    const isCentralBOA = locals.user!.role === 'BOA' && (!locals.user!.university_id || activeUniv?.is_team);
    const canAssignToOthers = isGlobalAdmin || ['UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER'].includes(locals.user!.role as string) || isCentralBOA;

    // Status Update Restriction: Only Assigner, Assignee, or Admin
    if (updates.status && !(isGlobalAdmin || isAssigner || isAssignee)) {
        throw error(403, 'Only the assigner, assignee, or an admin can update task status');
    }

    // General Edit Restriction: Non-admins who aren't assigners/assignees can't edit other people's tasks
    if (!(isGlobalAdmin || isAssigner || isAssignee)) {
        throw error(403, 'Forbidden: You do not have permission to edit this task');
    }

    if (updates.assignee_ids && !canAssignToOthers) {
        // Restricted regional BOA roles can only update task and maintain themselves as assignee
        // They shouldn't be able to change assignees to others
        updates.assignee_ids = [locals.user!.id];
    }

    // Individual Assignee Status Handling
    if (updates.status && isAssignee) {
        updates.assignee_id = locals.user!.id;
        updates.assignee_status = updates.status;

        // Non-admins/non-assigners can't directly force the global status
        // shared/updateTask will auto-promote it to COMPLETED if all assignees are done
        if (!isGlobalAdmin && !isAssigner) {
            delete (updates as any).status;
        }
    }

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
