import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeUniversityRollup, getFeeOverallSummary, upsertFeeUniversityMeta } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');

    const [universities, summary] = await Promise.all([
        getFeeUniversityRollup(periodId),
        getFeeOverallSummary(periodId)
    ]);
    return json({ universities, summary });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'edit_payments');
    const body = await request.json();
    if (!body.period_id || !body.university_id) throw error(400, 'period_id and university_id required');
    const meta = await upsertFeeUniversityMeta(body);
    return json(meta);
};
