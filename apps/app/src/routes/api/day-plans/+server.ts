import { getDayPlans, createDayPlan, updateDayPlan, deleteDayPlan } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const date = url.searchParams.get('date') || undefined;
    const plans = await getDayPlans(locals.user.id, date);
    return json(plans);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const data = await request.json();
    if (!data.title) throw error(400, 'Title required');

    const plan = await createDayPlan({
        ...data,
        user_id: locals.user.id
    });
    return json(plan);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const data = await request.json();
    const { id, ...updates } = data;
    if (!id) throw error(400, 'ID required');

    const plan = await updateDayPlan(id, updates);
    return json(plan);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID required');

    await deleteDayPlan(id);
    return json({ success: true });
};
