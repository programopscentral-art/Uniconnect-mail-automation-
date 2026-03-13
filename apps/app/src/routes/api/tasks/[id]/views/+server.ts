import { logTaskView, updateViewDuration, getTaskViewStats } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — get view stats for a task (admin only)
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const stats = await getTaskViewStats(params.id);
    return json(stats);
};

// POST — log a view
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json().catch(() => ({}));
    const log = await logTaskView(params.id, locals.user.id, body.sessionId);
    return json(log);
};

// PATCH — update view duration
export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (!body.viewLogId || !body.durationSeconds) throw error(400);
    await updateViewDuration(body.viewLogId, body.durationSeconds);
    return json({ ok: true });
};
