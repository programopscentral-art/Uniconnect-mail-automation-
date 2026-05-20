import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeePeriods, getActiveFeePeriod, createFeePeriod } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    if (url.searchParams.get('active') === 'true') {
        const p = await getActiveFeePeriod();
        return json(p);
    }
    const periods = await getFeePeriods();
    return json(periods);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'admin');
    const body = await request.json();
    if (!body.name || !body.term) throw error(400, 'name and term required');
    const p = await createFeePeriod({
        name: body.name,
        program: body.program,
        term: body.term,
        academic_year: body.academic_year,
        created_by: locals.user!.id
    });
    return json(p);
};
