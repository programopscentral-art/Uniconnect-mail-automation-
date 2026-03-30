import { getMeetingConnections, deleteMeetingConnection } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: List current user's meeting connections
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const connections = await getMeetingConnections(locals.user.id);
    return json({ connections });
};

// DELETE: Remove meeting connection(s)
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');

    if (id) {
        // Delete specific connection
        console.log(`[MEETINGS] Disconnecting connection ${id} for user ${locals.user.id}`);
        await deleteMeetingConnection(id);
    } else {
        // Delete ALL connections for this user
        console.log(`[MEETINGS] Disconnecting ALL connections for user ${locals.user.id}`);
        const connections = await getMeetingConnections(locals.user.id);
        for (const conn of connections) {
            await deleteMeetingConnection(conn.id);
            console.log(`[MEETINGS] Deleted connection ${conn.id} (${conn.email})`);
        }
    }

    return json({ success: true });
};
