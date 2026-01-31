import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateUserPresence, batchClearPresence } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { status, mode } = await request.json();
    if (!['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'].includes(status)) {
        throw error(400, 'Invalid status');
    }

    await updateUserPresence(locals.user.id, status, mode || 'AUTO');

    // Probabilistically trigger cleanup (10% chance) to avoid dedicated cron as a simple solution
    if (Math.random() < 0.1) {
        await batchClearPresence();
    }

    return json({ success: true });
};
