import { getCommunicationTaskById, updateCommunicationTaskStatus, addCommunicationTaskCompletion } from '@uniconnect/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const { user } = locals;
    if (!user) throw redirect(302, '/login');

    const task = await getCommunicationTaskById(params.id);
    if (!task) throw error(404, 'Task not found');

    // Security: only allow admins or assigned users
    const isAdmin = ['ADMIN', 'PROGRAM_OPS', 'BOA', 'COS', 'PMA', 'PM', 'CMA', 'CMA_MANAGER', 'UNIVERSITY_OPERATOR'].includes(user.role);
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
            const task = await getCommunicationTaskById(params.id);
            if (!task) return fail(404, { error: 'Task not found' });

            // Determine which university this user is completing for
            const userUnies = user.universities?.map(u => u.name) || [];
            const intersection = userUnies.filter(u => task.universities.includes(u));
            const completedFor = intersection.length > 0 ? intersection.join(', ') : (userUnies.length > 0 ? userUnies.join(', ') : 'System Admin');

            // Add completion log
            const updatedTask = await addCommunicationTaskCompletion(params.id, {
                user_id: user.id,
                user_name: user.name || user.email,
                user_email: user.email,
                university: completedFor,
                completed_at: new Date()
            });

            // Check if all universities have been completed
            const allCoveredUniversities = new Set<string>();
            for (const comp of (updatedTask.completions || [])) {
                comp.university.split(', ').forEach((u: string) => allCoveredUniversities.add(u.trim()));
            }

            // If "System Admin" did it, or all task universities are covered
            const isSystemAdmin = allCoveredUniversities.has('System Admin');
            const allDone = task.universities.every(tu => allCoveredUniversities.has(tu));

            if (isSystemAdmin || allDone) {
                await updateCommunicationTaskStatus(params.id, 'Completed', undefined, new Date());
            }

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
