import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logEventView, updateEventViewDuration, getEventViewStats } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const stats = await getEventViewStats(params.id);
    return json(stats);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    const log = await logEventView(params.id, locals.user.id, body.sessionId);
    return json(log);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (body.viewLogId && body.durationSeconds) {
        await updateEventViewDuration(body.viewLogId, body.durationSeconds);
        return json({ success: true });
    }
    throw error(400, 'viewLogId and durationSeconds required');
};
