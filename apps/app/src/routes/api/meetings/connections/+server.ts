import { getMeetingConnections, deleteMeetingConnection } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: List meeting connections
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    const connections = await getMeetingConnections(universityId || undefined);

    return json({ connections });
};

// DELETE: Remove a meeting connection
export const DELETE: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Only admins can disconnect meeting bot');
    }

    const { id } = await request.json();
    if (!id) throw error(400, 'Connection ID required');

    await deleteMeetingConnection(id);
    return json({ success: true });
};
