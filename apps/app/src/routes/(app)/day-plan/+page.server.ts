import { getTasks, getMailboxes } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Fetch ALL tasks for the user to calculate stats
    const allTasks = await getTasks({ assigned_to: locals.user.id });

    // Filter for Today's tasks (due today or spanning today)
    const todayTasks = allTasks.filter(t => {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
    });

    // Stats
    const completedToday = todayTasks.filter(t => t.status === 'COMPLETED').length;
    const pendingToday = todayTasks.filter(t => t.status === 'PENDING').length;

    // Overdue: Pending and due_date < today
    const overdue = allTasks.filter(t => {
        if (t.status === 'COMPLETED' || !t.due_date) return false;
        const d = new Date(t.due_date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() < today.getTime();
    }).length;

    const mailboxes = locals.user.university_id ? await getMailboxes(locals.user.university_id) : [];

    return {
        tasks: todayTasks,
        stats: {
            total: todayTasks.length,
            completed: completedToday,
            pending: pendingToday,
            overdue
        },
        mailboxes: mailboxes.filter(m => m.status !== 'ACTIVE'),
        universities: await Promise.resolve([]) // Should fetch for quick add if needed
    };
};
