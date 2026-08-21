import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, addPettyCashSettlement, transitionPettyCashStatus } from '@uniconnect/shared';
import { assertFinance } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

// Finance closes the loop on the rupee difference. Enforced by the DB invariant:
// spent + balance = total disbursed.
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    assertFinance(locals.user);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;
    if (!['BILL_VERIFIED', 'BILL_SUBMITTED', 'DISBURSED'].includes(r.status)) {
        throw error(400, 'Only disbursed requests with verified bills can be settled.');
    }

    const body = await request.json();
    const paid = Number(r.total_paid || 0);
    const spent = body.spent_amount !== undefined ? Number(body.spent_amount) : Number(r.bill_total || 0);
    if (!(spent >= 0)) throw error(400, 'A valid spent amount is required.');
    const balance = Math.round((paid - spent) * 100) / 100;
    const direction = balance > 0 ? 'RETURNED' : balance < 0 ? 'TOPPED_UP' : 'EXACT';

    const actor = { id: locals.user.id, name: locals.user.name || locals.user.email };
    try {
        await addPettyCashSettlement(params.id, {
            spent_amount: spent,
            balance_amount: balance,
            direction,
            settled_on: body.settled_on,
            reference: body.reference,
            reason_code: body.reason_code,
            settled_by: actor.id,
            settled_by_name: actor.name,
        });
    } catch (e: any) {
        throw error(400, e.message || 'Settlement rejected by the ledger rules.');
    }

    const updated = await transitionPettyCashStatus(params.id, 'SETTLED', actor,
        `Settled — ${direction} ₹${Math.abs(balance).toLocaleString('en-IN')}`);
    await notifyPettyCashUpdate(updated, 'SETTLED', actor.name);
    return json({ ok: true, status: 'SETTLED', direction, balance });
};
