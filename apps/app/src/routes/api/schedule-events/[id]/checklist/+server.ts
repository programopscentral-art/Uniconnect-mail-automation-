import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEventChecklistItems, addEventChecklistItem, addEventChecklistItemsBulk, toggleEventChecklistItem, deleteEventChecklistItem, getEventChecklistProgress, generateChecklistFromDescription } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const items = await getEventChecklistItems(params.id);
    const progress = await getEventChecklistProgress(params.id);
    return json({ items, progress });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    if (body.auto_generate && body.description) {
        const checklistTexts = generateChecklistFromDescription(body.description);
        if (checklistTexts.length > 0) {
            const items = await addEventChecklistItemsBulk(params.id, checklistTexts);
            return json({ generated: items.length, items });
        }
        return json({ generated: 0, items: [] });
    }

    if (body.items && Array.isArray(body.items)) {
        const items = await addEventChecklistItemsBulk(params.id, body.items);
        return json({ added: items.length, items });
    }

    if (body.title) {
        const item = await addEventChecklistItem(params.id, body.title);
        return json(item);
    }

    throw error(400, 'Title or auto_generate required');
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();
    if (body.toggle && body.itemId) {
        const item = await toggleEventChecklistItem(body.itemId, locals.user.id);
        return json(item);
    }
    throw error(400, 'Invalid request');
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const itemId = url.searchParams.get('itemId');
    if (!itemId) throw error(400, 'Item ID required');
    await deleteEventChecklistItem(itemId);
    return json({ success: true });
};
