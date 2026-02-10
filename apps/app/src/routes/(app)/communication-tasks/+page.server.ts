import { getCommunicationTasks, deleteCommunicationTask } from '@uniconnect/shared';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    const { user } = locals;
    if (!user) return { tasks: [] };

    // If ADMIN, PROGRAM_OPS, COS, PMA or PM, fetch all tasks. Otherwise only assigned tasks.
    const hasFullVisibility = ['ADMIN', 'PROGRAM_OPS', 'COS', 'PMA', 'PM'].includes(user.role);
    const tasks = await getCommunicationTasks(hasFullVisibility ? undefined : user.id);

    return {
        tasks,
        user
    };
};

export const actions: Actions = {
    delete: async ({ request, locals }) => {
        const { user } = locals;
        if (!user || !['ADMIN', 'PROGRAM_OPS', 'COS', 'PMA', 'PM'].includes(user.role)) {
            return fail(403, { error: 'Unauthorized' });
        }

        const data = await request.formData();
        const id = data.get('id') as string;

        if (!id) return fail(400, { error: 'Missing task ID' });

        try {
            await deleteCommunicationTask(id);
            return { success: true };
        } catch (error) {
            console.error('Failed to delete task:', error);
            return fail(500, { error: 'Failed to delete task' });
        }
    }
};
