import { getCommunicationTaskById, updateCommunicationTaskStatus } from '@uniconnect/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const { user } = locals;
    if (!user) throw redirect(302, '/login');

    const task = await getCommunicationTaskById(params.id);
    if (!task) throw error(404, 'Task not found');

    // Security: only allow admins or assigned users
    const isAdmin = ['ADMIN', 'PROGRAM_OPS', 'COS', 'PMA', 'PM'].includes(user.role);
    const isAssigned = task.assigned_to.includes(user.id);

    if (!isAdmin && !isAssigned) {
        throw error(403, 'Unauthorized access to this task');
    }

    return {
        task
    };
};

export const actions: Actions = {
    complete: async ({ params, locals }) => {
        const { user } = locals;
        if (!user) return fail(401);

        try {
            await updateCommunicationTaskStatus(params.id, 'Completed', undefined, new Date());
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to update task' });
        }
    },
    report: async ({ params, locals, request }) => {
        const { user } = locals;
        if (!user) return fail(401);

        // In a real app we'd save the issue to a separate table or update notes
        // For now let's just update notes
        const data = await request.formData();
        const issue = data.get('issue') as string;

        try {
            // Update notes with issue report
            // This is a simplification
            await updateCommunicationTaskStatus(params.id, 'Canceled');
        } catch (e) {
            return fail(500);
        }
    }
};
