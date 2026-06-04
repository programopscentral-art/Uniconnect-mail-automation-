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
import { env } from '$env/dynamic/private';
import { checkFeeAccess } from '$lib/server/fee_access';
import { fireSnapshot } from '$lib/server/fee_snapshot';

export const POST: RequestHandler = async ({ params, locals, url, request }) => {
    if (!params.id) throw error(400, 'window id required');

    // Auth: either an admin user session, OR an x-internal-sync-token header
    // that matches INTERNAL_SYNC_TOKEN. Worker uses the latter.
    // IMPORTANT: read env via $env/dynamic/private — adapter-node sometimes
    // inlines process.env.X to undefined at build time when the var wasn't
    // visible to Vite, which silently broke the worker's calls and produced
    // 0 snapshot notifications for days.
    const internalToken = request.headers.get('x-internal-sync-token');
    const expectedToken = env.INTERNAL_SYNC_TOKEN || '';
    const isInternal = !!(expectedToken && internalToken === expectedToken);
    if (!isInternal) checkFeeAccess(locals, 'admin');

    // ?kind=morning|evening|manual — default manual
    const kindParam = (url.searchParams.get('kind') || 'manual').toLowerCase();
    const kind = kindParam === 'morning' ? 'fee_snapshot_morning'
              : kindParam === 'evening' ? 'fee_snapshot_evening'
              : 'fee_snapshot_manual';

    const startedMs = Date.now();
    try {
        const result = await fireSnapshot(params.id, kind);
        console.log(JSON.stringify({
            ts: new Date().toISOString(), level: 'info',
            scope: 'fee2.snapshot.endpoint', msg: 'fired',
            window_id: params.id, kind,
            actor: isInternal ? 'worker' : `user:${locals.user?.email ?? 'unknown'}`,
            recipients_total: result.recipients_total,
            recipients_sent: result.recipients_sent,
            recipients_deduped: result.recipients_deduped,
            errors: result.errors.length,
            elapsed_ms: Date.now() - startedMs,
        }));
        return json({ ok: true, summary: result });
    } catch (e) {
        console.error(JSON.stringify({
            ts: new Date().toISOString(), level: 'error',
            scope: 'fee2.snapshot.endpoint', msg: 'failed',
            window_id: params.id, kind,
            actor: isInternal ? 'worker' : `user:${locals.user?.email ?? 'unknown'}`,
            error: (e as Error).message,
            elapsed_ms: Date.now() - startedMs,
        }));
        throw error(500, (e as Error).message);
    }
};
