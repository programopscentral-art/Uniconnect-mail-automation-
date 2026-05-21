import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { env } from '$env/dynamic/private';
import { checkFeeAccess } from '$lib/server/fee_access';
import { runFullSync } from '$lib/server/fee_sync';

/**
 * Trigger a manual sync for this period. Admin only, OR worker with shared token.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!params.id) throw error(400, 'period id required');

    // Worker calls this endpoint with x-internal-sync-token to bypass user auth
    const internalToken = request.headers.get('x-internal-sync-token');
    const expectedToken = env.INTERNAL_SYNC_TOKEN || '';
    const isInternalCall = !!expectedToken && internalToken === expectedToken;

    if (!isInternalCall) {
        checkFeeAccess(locals, 'admin');
    }

    const periodRes = await db.query(`SELECT id, sheet_id, sheet_tabs_config FROM fee_periods WHERE id = $1`, [params.id]);
    const period = periodRes.rows[0];
    if (!period) throw error(404, 'Period not found');
    if (!period.sheet_id) throw error(400, 'This period has no Google Sheet configured. Edit the period and add a sheet ID first.');

    const result = await runFullSync(period, locals.user?.id);
    return json(result);
};
