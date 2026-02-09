import { getAllUniversities, getAllUsers } from '@uniconnect/shared';
import type { PageServerLoad, Actions } from './$types';
import { createCommunicationTask } from '@uniconnect/shared';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    const { user } = locals;
    if (!user || !['ADMIN', 'PROGRAM_OPS', 'COS'].includes(user.role)) {
        throw redirect(302, '/communication-tasks');
    }

    const universities = await getAllUniversities();
    const users = await getAllUsers();

    return {
        universities,
        users: users.map(u => ({ id: u.id, name: u.name, role: u.role }))
    };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const { user } = locals;
        if (!user) return fail(401);

        const data = await request.formData();
        const universities = data.getAll('universities') as string[];
        const channel = data.get('channel') as any;
        const assignedTo = data.getAll('assigned_to') as string[];
        const title = data.get('message_title') as string;
        const body = data.get('message_body') as string;
        const scheduledAt = data.get('scheduled_at') as string;
        const priority = data.get('priority') as any;
        const notes = data.get('notes') as string;

        if (!universities.length || !channel || !assignedTo.length || !title || !body || !scheduledAt) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            await createCommunicationTask({
                universities,
                channel,
                assigned_to: assignedTo,
                message_title: title,
                message_body: body,
                scheduled_at: new Date(scheduledAt),
                priority,
                notes,
                created_by: user.id
            });
        } catch (error) {
            console.error('Failed to create communication task:', error);
            return fail(500, { error: 'Internal server error' });
        }

        throw redirect(302, '/communication-tasks');
    }
};
