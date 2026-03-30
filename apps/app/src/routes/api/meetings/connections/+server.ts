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
export const DELETE: RequestHandler = async ({ request, url, locals }) => {
    if (!locals.user) throw error(401);

    // Support both query param and JSON body for the connection ID
    let id = url.searchParams.get('id');
    if (!id) {
        try {
            const body = await request.json();
            id = body.id;
        } catch {
            // Body might be empty or not JSON
        }
    }
    if (!id) throw error(400, 'Connection ID required');

    console.log(`[MEETINGS] Disconnecting connection ${id} for user ${locals.user.id}`);
    await deleteMeetingConnection(id);
    console.log(`[MEETINGS] Connection ${id} deleted successfully`);
    return json({ success: true });
};
