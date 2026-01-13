import { emailQueue } from '$lib/server/queue';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user || (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS')) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        emailQueue.getWaitingCount(),
        emailQueue.getActiveCount(),
        emailQueue.getCompletedCount(),
        emailQueue.getFailedCount(),
        emailQueue.getDelayedCount()
    ]);

    const activeJobs = await emailQueue.getJobs(['active']);
    const waitingJobs = await emailQueue.getJobs(['waiting']);

    return json({
        counts: { waiting, active, completed, failed, delayed },
        activeJobs: activeJobs.map(j => ({ id: j.id, data: j.data })),
        waitingJobs: waitingJobs.map(j => ({ id: j.id, data: j.data }))
    });
};
