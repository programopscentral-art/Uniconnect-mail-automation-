import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, verifyPettyCashBill, transitionPettyCashStatus } from '@uniconnect/shared';
import { assertFinance } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

// Finance verifies (or rejects) a bill. Once at least one bill is verified and
// none are left pending, the request advances to BILL_VERIFIED.
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    assertFinance(locals.user);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');

    const body = await request.json().catch(() => ({}));
    const decision = body.decision === 'reject' ? 'REJECTED' : 'VERIFIED';
    const actor = { id: locals.user.id, name: locals.user.name || locals.user.email };

    await verifyPettyCashBill(params.billId, actor, decision as 'VERIFIED' | 'REJECTED');

    // Re-read and decide whether the whole request is now verified.
    const fresh = await getPettyCashRequestById(params.id);
    const bills = fresh!.bills;
    const anyVerified = bills.some((b: any) => b.status === 'VERIFIED');
    const anyPending = bills.some((b: any) => b.status === 'PENDING');
    let status = fresh!.request.status;
    if (fresh!.request.status === 'BILL_SUBMITTED' && anyVerified && !anyPending) {
        const updated = await transitionPettyCashStatus(params.id, 'BILL_VERIFIED', actor, 'Bill(s) verified');
        void notifyPettyCashUpdate(updated, 'BILL_VERIFIED', actor.name).catch(() => {});
        status = 'BILL_VERIFIED';
    }
    return json({ ok: true, decision, status });
};
