import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById } from '@uniconnect/shared';
import { isFinance, isGlobalAdmin, pendingLevel } from '$lib/server/petty_cash_access';
import { notifyPettyCashUpdate } from '$lib/server/petty_cash';
import type { RequestHandler } from './$types';

/**
 * Re-send the current stage's approval notification (email + in-app) to the
 * approver who owes a decision — Level 1 (Pravalika) on SUBMITTED, Level 2
 * (Satish) on L1_APPROVED. Useful for requests raised before the routing changed,
 * or simply to nudge. Finance / admins may trigger it.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    if (!isFinance(locals.user) && !isGlobalAdmin(locals.user)) {
        throw error(403, 'Only the finance team or an admin can resend an approval notification.');
    }
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;

    const level = pendingLevel(r.status);
    if (!level) throw error(400, 'This request is not awaiting an approval decision.');

    // Re-fire the same notification the stage transition would send.
    await notifyPettyCashUpdate(r, r.status, r.requester_name || r.requester_email || 'The requester');
    return json({ ok: true, level, approver: level === 1 ? 'Pravalika' : 'Satish' });
};
