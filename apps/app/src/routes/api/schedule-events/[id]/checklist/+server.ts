import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEventChecklistItems, addEventChecklistItem, addEventChecklistItemsBulk, toggleEventChecklistItem, deleteEventChecklistItem, getEventChecklistProgress, getEventChecklistProgressBySection, generateChecklistFromDescription, checkAndCompleteEvent, getScheduleEventById } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const items = await getEventChecklistItems(params.id);
    const progress = await getEventChecklistProgress(params.id);
    const sectionProgress = await getEventChecklistProgressBySection(params.id);
    return json({ items, progress, sectionProgress });
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

        // Check if event is now fully completed
        const justCompleted = await checkAndCompleteEvent(params.id);
        if (justCompleted) {
            try {
                const event = await getScheduleEventById(params.id);
                if (event) {
                    const { NotificationService } = await import('@uniconnect/shared');
                    if (NotificationService?.notifyBulk) {
                        await NotificationService.notifyBulk(
                            event.university_id,
                            'SE',
                            'Event Completed',
                            `All checklist items for "${event.title}" have been completed.`,
                            '/dashboard'
                        );
                    }
                }
            } catch (e) {
                console.warn('[CHECKLIST] Could not notify on completion:', e);
            }
        }

        const progress = await getEventChecklistProgress(params.id);
        const sectionProgress = await getEventChecklistProgressBySection(params.id);
        return json({ item, progress, sectionProgress, eventCompleted: justCompleted });
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
