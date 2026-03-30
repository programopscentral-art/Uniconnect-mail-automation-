import { getMeetingConnections, deleteMeetingConnection } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: List current user's meeting connections
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const connections = await getMeetingConnections(locals.user.id);
    return json({ connections });
};

// DELETE: Remove a meeting connection
export const DELETE: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { id } = await request.json();
    if (!id) throw error(400, 'Connection ID required');

    await deleteMeetingConnection(id);
    return json({ success: true });
};
