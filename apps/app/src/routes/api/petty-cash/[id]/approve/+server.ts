import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, transitionPettyCashStatus, addPettyCashApproval, type PettyCashStatus } from '@uniconnect/shared';
import { assertApproveStage, isFinance, isGlobalAdmin } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

/**
 * POST { action: 'approve' | 'send_back' | 'reject' | 'cancel', ... }
 *
 * Two-level approval:
 *   SUBMITTED   → (Level-1, Pravalika) approve → L1_APPROVED
 *   L1_APPROVED → (Level-2, Satish) approve    → APPROVED  (creates the approval record)
 * send_back / reject can happen at either level, by that level's approver.
 *
 * approve (Level 2) accepts: amount_approved, approval_channel (IN_APP|WHATSAPP|CALL|EMAIL),
 *                            evidence_url, approved_by_name (for offline), remarks
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const actor = { id: locals.user.id, name: locals.user.name || locals.user.email };

    let toStatus: PettyCashStatus;

    if (action === 'approve') {
        // Only the approver for the request's CURRENT stage may act.
        assertApproveStage(locals.user, r.status);

        if (r.status === 'SUBMITTED') {
            // Level 1 (Pravalika): first sign-off. No amount / evidence needed here —
            // the budget check + final amount are decided at Level 2.
            toStatus = 'L1_APPROVED';
        } else if (r.status === 'L1_APPROVED') {
            // Level 2 (Satish): budget check + final approval. This is the record the
            // disbursement invariant checks against.
            const channel = String(body.approval_channel || 'IN_APP').toUpperCase();
            const amount_approved = body.amount_approved !== undefined ? Number(body.amount_approved) : Number(r.amount_requested);
            if (!(amount_approved > 0)) throw error(400, 'Approved amount must be greater than zero.');
            if (channel !== 'IN_APP' && !body.evidence_url) {
                throw error(400, 'Offline approvals require an uploaded evidence (e.g. the WhatsApp screenshot).');
            }
            await addPettyCashApproval(params.id, {
                amount_approved,
                approval_channel: channel,
                evidence_url: body.evidence_url,
                remarks: body.remarks,
                approved_by: channel === 'IN_APP' ? locals.user.id : null,
                approved_by_name: channel === 'IN_APP' ? actor.name : (body.approved_by_name || 'Offline approver'),
                recorded_by: locals.user.id,
                recorded_by_name: actor.name,
            });
            toStatus = 'APPROVED';
        } else {
            throw error(400, 'This request is not awaiting approval.');
        }
    } else if (action === 'send_back') {
        assertApproveStage(locals.user, r.status);
        if (!body.note) throw error(400, 'Add a note describing what needs changing.');
        toStatus = 'SENT_BACK';
    } else if (action === 'reject') {
        assertApproveStage(locals.user, r.status);
        if (!body.note) throw error(400, 'A reason is required to reject.');
        toStatus = 'REJECTED';
    } else if (action === 'cancel') {
        // Requester or finance may cancel — but only before the money moves.
        const isOwner = r.requester_user_id === locals.user.id;
        if (!isOwner && !isFinance(locals.user) && !isGlobalAdmin(locals.user)) throw error(403, 'Not allowed.');
        if (!['DRAFT', 'SUBMITTED', 'L1_APPROVED', 'SENT_BACK', 'APPROVED'].includes(r.status)) {
            throw error(400, 'Cancellation is only possible before disbursement.');
        }
        toStatus = 'CANCELLED';
    } else {
        throw error(400, 'Unknown action.');
    }

    const updated = await transitionPettyCashStatus(params.id, toStatus, actor, body.note || body.remarks);
    void notifyPettyCashUpdate(updated, toStatus, actor.name, body.note || body.remarks).catch(() => {});
    return json({ ok: true, status: toStatus });
};
