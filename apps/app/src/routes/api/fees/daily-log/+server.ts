import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeDailyLog, createFeeDailyEntry, deleteFeeDailyEntry, getDailyPaymentRollup } from '@uniconnect/shared';
import { checkFeeAccess, isAdminRole } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');
    const filters = {
        university_id: url.searchParams.get('university_id') || undefined,
        month: url.searchParams.get('month') ? parseInt(url.searchParams.get('month')!) : undefined,
        year: url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!) : undefined,
    };

    if (url.searchParams.get('source') === 'transactions') {
        // Rollup from imported payment transactions (Day_Wise_Payments tab)
        const rollup = await getDailyPaymentRollup(periodId, filters);
        return json(rollup);
    }

    const rows = await getFeeDailyLog(periodId, filters);
    return json(rows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    const body = await request.json();
    if (!body.period_id || !body.university_id || !body.date) {
        throw error(400, 'period_id, university_id, date required');
    }
    try {
        const row = await createFeeDailyEntry({
            period_id: body.period_id,
            university_id: body.university_id,
            date: body.date,
            amount: Number(body.amount) || 0,
            students_count: Number(body.students_count) || 0,
            notes: body.notes || undefined,
            created_by: locals.user!.id
        }, isAdminRole(locals));
        return json(row);
    } catch (e: any) {
        throw error(423, e.message); // 423 Locked
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id required');
    try {
        await deleteFeeDailyEntry(id, isAdminRole(locals));
        return json({ success: true });
    } catch (e: any) {
        throw error(423, e.message);
    }
};
