import { getChecklistItems, addChecklistItem, addChecklistItemsBulk, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, generateChecklistFromDescription, getChecklistProgress } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — get all checklist items for a task
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const items = await getChecklistItems(params.id);
    const progress = await getChecklistProgress(params.id);
    return json({ items, progress });
};

// POST — add checklist item(s)
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    if (body.auto_generate && body.description) {
        // Auto-generate from description
        const titles = generateChecklistFromDescription(body.description);
        const items = await addChecklistItemsBulk(params.id, titles);
        return json({ items, generated: titles.length });
    }

    if (body.items && Array.isArray(body.items)) {
        const items = await addChecklistItemsBulk(params.id, body.items);
        return json({ items });
    }

    if (body.title) {
        const item = await addChecklistItem(params.id, body.title);
        return json(item);
    }

    throw error(400, 'title or items required');
};

// PATCH — toggle or update a checklist item
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const body = await request.json();

    if (body.toggle && body.itemId) {
        const item = await toggleChecklistItem(body.itemId, locals.user.id);
        return json(item);
    }

    if (body.itemId && body.title) {
        const item = await updateChecklistItem(body.itemId, body.title);
        return json(item);
    }

    throw error(400, 'Invalid request');
};

// DELETE — remove a checklist item
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const itemId = url.searchParams.get('itemId');
    if (!itemId) throw error(400, 'itemId required');
    await deleteChecklistItem(itemId);
    return json({ ok: true });
};
