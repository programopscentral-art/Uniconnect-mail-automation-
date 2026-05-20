import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTaggedStudents } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');
    const tag = url.searchParams.get('tag') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const rows = await getTaggedStudents(periodId, tag, search);
    return json(rows);
};
