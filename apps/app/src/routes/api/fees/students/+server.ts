import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeStudents, upsertFeeStudentPayment } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const period_id = url.searchParams.get('period_id');
    if (!period_id) throw error(400, 'period_id required');
    const result = await getFeeStudents({
        period_id,
        university_id: url.searchParams.get('university_id') || undefined,
        status: url.searchParams.get('status') || undefined,
        tag: url.searchParams.get('tag') || undefined,
        search: url.searchParams.get('search') || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
    });
    return json(result);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'edit_payments');
    const body = await request.json();
    if (!body.period_id || !body.university_id || !body.zoho_user_id) {
        throw error(400, 'period_id, university_id, zoho_user_id required');
    }
    const row = await upsertFeeStudentPayment(body);
    return json(row);
};
