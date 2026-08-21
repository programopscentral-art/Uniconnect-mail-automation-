import { json, error } from '@sveltejs/kit';
import { getPettyCashRequestById, addPettyCashBill, transitionPettyCashStatus, db } from '@uniconnect/shared';
import { isFinance } from '$lib/server/petty_cash_access';
import type { RequestHandler } from './$types';

// Requester (or finance) attaches a bill. First bill moves DISBURSED → BILL_SUBMITTED.
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    const r = detail.request;

    const isOwner = r.requester_user_id === locals.user.id;
    if (!isOwner && !isFinance(locals.user)) throw error(403, 'Only the requester or finance can add a bill.');
    if (!['DISBURSED', 'BILL_SUBMITTED'].includes(r.status)) {
        throw error(400, 'Bills can only be added after disbursement.');
    }

    const body = await request.json();
    if (!(Number(body.bill_amount) > 0)) throw error(400, 'A valid bill amount is required.');

    // Dedupe guard (edge case 5): same (vendor, bill_no, amount) already on a request.
    if (body.bill_no && body.vendor) {
        const dup = await db.query(
            `SELECT 1 FROM petty_cash_bills WHERE vendor = $1 AND bill_no = $2 AND bill_amount = $3 LIMIT 1`,
            [body.vendor, body.bill_no, Number(body.bill_amount)],
        );
        if (dup.rowCount) throw error(400, 'This bill (same vendor, number and amount) is already recorded.');
    }

    const bill = await addPettyCashBill(params.id, {
        bill_no: body.bill_no,
        bill_date: body.bill_date,
        vendor: body.vendor,
        bill_amount: Number(body.bill_amount),
        file_url: body.file_url,
        file_name: body.file_name,
        source: body.source || 'UPLOAD',
        uploaded_by: locals.user.id,
    });

    const actor = { id: locals.user.id, name: locals.user.name || locals.user.email };
    if (r.status === 'DISBURSED') {
        await transitionPettyCashStatus(params.id, 'BILL_SUBMITTED', actor, 'Bill submitted');
    }
    return json({ ok: true, bill, status: r.status === 'DISBURSED' ? 'BILL_SUBMITTED' : r.status });
};
