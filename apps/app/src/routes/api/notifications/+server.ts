import { json, error } from '@sveltejs/kit';
import { getNotifications, markAsRead } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const notifications = await getNotifications(locals.user.id);
    return json(notifications);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const { id } = await request.json();
    if (!id) throw error(400, 'Notification ID required');
    await markAsRead(id);
    return json({ success: true });
};
