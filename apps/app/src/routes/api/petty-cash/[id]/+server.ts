import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, updatePettyCashRequest, db } from '@uniconnect/shared';
import { assertUniversityAccess, isGlobalAdmin } from '$lib/server/petty_cash_access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    assertUniversityAccess(locals.user, detail.request.university_id);
    return json(detail);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;

    // Only the requester (or a global admin) may edit, and only in DRAFT / SENT_BACK.
    const isOwner = r.requester_user_id === locals.user.id;
    if (!isOwner && !isGlobalAdmin(locals.user)) throw error(403, 'Only the requester can edit this request.');
    if (!['DRAFT', 'SENT_BACK'].includes(r.status)) throw error(400, 'Only draft or sent-back requests can be edited.');

    const data = await request.json();
    const updated = await updatePettyCashRequest(params.id, {
        purpose: data.purpose,
        category: data.category,
        payee_vendor: data.payee_vendor,
        amount_requested: data.amount_requested !== undefined ? Number(data.amount_requested) : undefined,
        needed_by: data.needed_by,
        linked_activity: data.linked_activity,
    });
    return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;
    const isOwner = r.requester_user_id === locals.user.id;
    if (!isOwner && !isGlobalAdmin(locals.user)) throw error(403, 'Not allowed.');
    if (!['DRAFT', 'SENT_BACK', 'REJECTED'].includes(r.status)) {
        throw error(400, 'Only draft, sent-back, or rejected requests can be deleted.');
    }
    await db.query(`DELETE FROM petty_cash_requests WHERE id = $1`, [params.id]);
    return json({ ok: true });
};
