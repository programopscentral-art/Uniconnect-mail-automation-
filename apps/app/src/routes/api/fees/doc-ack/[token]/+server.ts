import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDocRequestByToken, markDocRequestOpened, acknowledgeDocRequest } from '@uniconnect/shared';

/** Public endpoint — no auth. Reads the request by token. */
export const GET: RequestHandler = async ({ params, getClientAddress, request }) => {
    if (!params.token) throw error(400, 'token required');
    const req = await getDocRequestByToken(params.token);
    if (!req) throw error(404, 'Invalid or expired link');
    // Mark as opened on first view
    await markDocRequestOpened(params.token, {
        ip: getClientAddress(),
        ua: request.headers.get('user-agent') || undefined,
    });
    return json(req);
};

/** Public endpoint — records acknowledgment. */
export const POST: RequestHandler = async ({ params, getClientAddress, request }) => {
    if (!params.token) throw error(400, 'token required');
    const updated = await acknowledgeDocRequest(params.token, {
        ip: getClientAddress(),
        ua: request.headers.get('user-agent') || undefined,
    });
    if (!updated) throw error(404, 'Invalid token');
    return json({ success: true, acknowledged_at: updated.acknowledged_at });
};
