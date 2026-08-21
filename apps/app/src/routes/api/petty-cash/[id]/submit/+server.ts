import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, transitionPettyCashStatus } from '@uniconnect/shared';
import { isGlobalAdmin } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

// Requester sends a DRAFT/SENT_BACK request for approval.
export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;

    const isOwner = r.requester_user_id === locals.user.id;
    if (!isOwner && !isGlobalAdmin(locals.user)) throw error(403, 'Only the requester can submit this request.');
    if (!['DRAFT', 'SENT_BACK'].includes(r.status)) throw error(400, 'Only draft or sent-back requests can be submitted.');
    if (!r.amount_requested || Number(r.amount_requested) <= 0) throw error(400, 'Add an amount before submitting.');

    const updated = await transitionPettyCashStatus(params.id, 'SUBMITTED',
        { id: locals.user.id, name: locals.user.name || locals.user.email }, 'Submitted for approval');
    await notifyPettyCashUpdate(updated, 'SUBMITTED', locals.user.name || locals.user.email);
    return json({ ok: true, status: 'SUBMITTED' });
};
