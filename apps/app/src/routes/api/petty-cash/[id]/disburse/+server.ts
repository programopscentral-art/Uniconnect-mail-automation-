import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, addPettyCashDisbursement, transitionPettyCashStatus } from '@uniconnect/shared';
import { assertFinance } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

// Finance records the money leaving. Bill deadline (7 days) starts here.
const BILL_WINDOW_DAYS = 7;

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    assertFinance(locals.user);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;
    if (r.status !== 'APPROVED') throw error(400, 'Only approved requests can be disbursed.');

    const body = await request.json();
    const amount_paid = Number(body.amount_paid);
    if (!(amount_paid > 0)) throw error(400, 'A valid paid amount is required.');
    const mode = String(body.payment_mode || 'UPI').toUpperCase();
    if (mode === 'CASH' && !body.reference_no && !body.proof_url) {
        throw error(400, 'Cash payments need a signed acknowledgement (reference or uploaded proof).');
    }

    const actor = { id: locals.user.id, name: locals.user.name || locals.user.email };
    try {
        await addPettyCashDisbursement(params.id, {
            amount_paid,
            paid_on: body.paid_on,
            payment_mode: mode,
            reference_no: body.reference_no,
            proof_url: body.proof_url,
            paid_by: actor.id,
            paid_by_name: actor.name,
        });
    } catch (e: any) {
        // Surfaces the DB invariant messages (no approval / exceeds approved amount).
        throw error(400, e.message || 'Disbursement rejected by the ledger rules.');
    }

    const paidOn = body.paid_on ? new Date(body.paid_on) : new Date();
    const due = new Date(paidOn.getTime() + BILL_WINDOW_DAYS * 86400000);
    const bill_due_on = due.toISOString().slice(0, 10);

    const updated = await transitionPettyCashStatus(params.id, 'DISBURSED', actor,
        `Paid ${mode} · ${body.reference_no || 'no ref'}`, { bill_due_on });
    void notifyPettyCashUpdate(updated, 'DISBURSED', actor.name).catch(() => {});
    return json({ ok: true, status: 'DISBURSED', bill_due_on });
};
