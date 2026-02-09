import { getCommunicationTasks } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const { user } = locals;
    if (!user) return { tasks: [] };

    // If ADMIN or PROGRAM_OPS, fetch all tasks. Otherwise only assigned tasks.
    const isAdmin = user.role === 'ADMIN' || user.role === 'PROGRAM_OPS';
    const tasks = await getCommunicationTasks(isAdmin ? undefined : user.id);

    return {
        tasks
    };
};
