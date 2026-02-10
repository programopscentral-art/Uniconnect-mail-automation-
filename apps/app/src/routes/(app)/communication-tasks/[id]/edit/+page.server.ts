import { getAllUniversities, getCommunicationTaskById, updateCommunicationTask } from '@uniconnect/shared';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { triggerCommTaskCheck } from '$lib/server/queue';

export const load: PageServerLoad = async ({ params, locals }) => {
    const { user } = locals;
    if (!user || !['ADMIN', 'PROGRAM_OPS', 'COS', 'PMA', 'PM', 'CMA', 'CMA_MANAGER'].includes(user.role)) {
        throw redirect(302, '/communication-tasks');
    }

    const task = await getCommunicationTaskById(params.id);
    if (!task) throw redirect(302, '/communication-tasks');

    const universities = await getAllUniversities();

    return {
        task,
        universities
    };
};

export const actions: Actions = {
    default: async ({ params, request, locals }) => {
        const { user } = locals;
        if (!user) return fail(401);

        const data = await request.formData();
        const universities = data.getAll('universities') as string[];
        const channel = data.get('channel') as any;
        const title = data.get('message_title') as string;
        const body = data.get('message_body') as string;
        const scheduledAt = data.get('scheduled_at') as string;
        const priority = data.get('priority') as any;
        const notes = data.get('notes') as string;

        const updateType = data.get('update_type') as any;
        const team = data.get('team') as any;
        const contentType = data.get('content_type') as any;
        const link = data.get('link') as string;

        if (!universities.length || !channel || !title || !body || !scheduledAt) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            // Normalize the scheduled time to UTC by appending the local offset if missing
            // datetime-local input sends YYYY-MM-DDTHH:MM which is local.
            // We assume IST (+05:30) for the primary users.
            const dateStr = scheduledAt.includes('+') || scheduledAt.includes('Z')
                ? scheduledAt
                : `${scheduledAt}:00+05:30`;

            await updateCommunicationTask(params.id, {
                universities,
                channel,
                message_title: title,
                message_body: body,
                scheduled_at: new Date(dateStr),
                priority,
                notes,
                update_type: updateType,
                team: team || null,
                content_type: contentType,
                link: link || undefined
            });

            // Trigger immediate worker check
            await triggerCommTaskCheck();
        } catch (error) {
            console.error('Failed to update communication task:', error);
            return fail(500, { error: 'Internal server error' });
        }

        throw redirect(302, `/communication-tasks/${params.id}`);
    }
};
