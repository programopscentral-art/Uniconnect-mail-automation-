import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllFeeRemarks } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');
    const rows = await getAllFeeRemarks(periodId, {
        role: url.searchParams.get('role') || undefined,
        case_type: url.searchParams.get('case_type') || undefined,
        search: url.searchParams.get('search') || undefined,
    });
    return json(rows);
};
