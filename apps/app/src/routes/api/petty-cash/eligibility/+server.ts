import { json, error } from '@sveltejs/kit';
import { listPettyCashEligibility, upsertPettyCashEligibility, revokePettyCashEligibility } from '@uniconnect/shared';
import { isGlobalAdmin, scopeUniversity } from '$lib/server/petty_cash_access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const university_id = scopeUniversity(locals.user, url.searchParams.get('university_id') || undefined);
    const rows = await listPettyCashEligibility(university_id);
    return json(rows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!isGlobalAdmin(locals.user)) throw error(403, 'Only admins can manage the eligibility register.');
    const data = await request.json();
    if (!data.user_id) throw error(400, 'User is required');
    const row = await upsertPettyCashEligibility({
        user_id: data.user_id,
        university_id: data.university_id || null,
        max_per_request: Number(data.max_per_request) || 10000,
        max_open_advance: Number(data.max_open_advance) || 15000,
        effective_from: data.effective_from,
        effective_to: data.effective_to || null,
        is_active: data.is_active !== false,
        granted_by: locals.user.id,
        granted_by_name: locals.user.name || locals.user.email,
    });
    return json(row);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    if (!isGlobalAdmin(locals.user)) throw error(403, 'Only admins can manage the eligibility register.');
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');
    await revokePettyCashEligibility(id);
    return json({ ok: true });
};
