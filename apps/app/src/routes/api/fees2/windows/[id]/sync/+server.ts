/**
 * POST /api/fees2/windows/:id/sync — manually trigger a sync (admin OR worker)
 *
 * Worker calls this with x-internal-sync-token to bypass user auth, same
 * pattern as the legacy /api/fees/periods/:id/sync endpoint.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { checkFeeAccess } from '$lib/server/fee_access';
import { syncFeeSemesterWindow } from '$lib/server/fee_sync_v2';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!params.id) throw error(400, 'id required');

    const internalToken = request.headers.get('x-internal-sync-token');
    const expectedToken = env.INTERNAL_SYNC_TOKEN || '';
    const isInternalCall = !!expectedToken && internalToken === expectedToken;
    if (!isInternalCall) checkFeeAccess(locals, 'admin');

    try {
        const summary = await syncFeeSemesterWindow(params.id);
        return json({ ok: true, summary });
    } catch (e) {
        throw error(500, (e as Error).message || 'Sync failed');
    }
};
