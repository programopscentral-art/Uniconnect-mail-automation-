import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEventMessages, addEventMessage, addEventMessagesBulk, toggleEventMessageSent, deleteEventMessage } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const messages = await getEventMessages(params.id);
    return json(messages);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    // Bulk add
    if (body.messages && Array.isArray(body.messages)) {
        const items = await addEventMessagesBulk(params.id, body.messages);
        return json({ added: items.length, items });
    }

    // Single add
    if (body.title && body.content) {
        const item = await addEventMessage(params.id, body.title, body.content);
        return json(item);
    }

    throw error(400, 'Title and content required');
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (body.toggle && body.messageId) {
        const item = await toggleEventMessageSent(body.messageId, locals.user.id);
        return json(item);
    }
    throw error(400, 'Invalid request');
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const messageId = url.searchParams.get('messageId');
    if (!messageId) throw error(400, 'Message ID required');
    await deleteEventMessage(messageId);
    return json({ success: true });
};
