/**
 * POST /api/fees2/windows/[id]/send-snapshot
 *
 * Admin-only manual trigger for the fee-collection snapshot email — same
 * recipient set as the worker's scheduled snapshots, same dedup keys
 * (per (window, kind, ist-date, recipient)) so a manual fire prevents
 * the worker from also firing later in the same day.
 *
 * Used to (a) verify the snapshot pipeline works end-to-end without
 * waiting for the next scheduled window, and (b) re-send if the worker
 * was down at the scheduled time.
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { checkFeeAccess } from '$lib/server/fee_access';
import { fireSnapshot } from '$lib/server/fee_snapshot';

export const POST: RequestHandler = async ({ params, locals, url }) => {
    checkFeeAccess(locals, 'admin');
    if (!params.id) throw error(400, 'window id required');

    // ?kind=morning|evening|manual — default manual
    const kindParam = (url.searchParams.get('kind') || 'manual').toLowerCase();
    const kind = kindParam === 'morning' ? 'fee_snapshot_morning'
              : kindParam === 'evening' ? 'fee_snapshot_evening'
              : 'fee_snapshot_manual';

    try {
        const result = await fireSnapshot(params.id, kind);
        return json({ ok: true, summary: result });
    } catch (e) {
        throw error(500, (e as Error).message);
    }
};
