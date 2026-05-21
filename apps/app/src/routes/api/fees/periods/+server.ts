import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeePeriods, getActiveFeePeriod, createFeePeriod, updateFeePeriodSync } from '@uniconnect/shared';
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
        batch_start_year: body.batch_start_year,
        batch_end_year: body.batch_end_year,
        sheet_id: body.sheet_id,
        sheet_tabs_config: body.sheet_tabs_config,
        auto_sync_enabled: body.auto_sync_enabled,
        auto_sync_interval_minutes: body.auto_sync_interval_minutes || 30,
        created_by: locals.user!.id
    });
    return json(p);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'admin');
    const body = await request.json();
    if (!body.id) throw error(400, 'id required');
    const updated = await updateFeePeriodSync(body.id, {
        sheet_id: body.sheet_id,
        sheet_tabs_config: body.sheet_tabs_config,
        auto_sync_enabled: body.auto_sync_enabled,
        auto_sync_interval_minutes: body.auto_sync_interval_minutes,
    });
    return json(updated);
};
