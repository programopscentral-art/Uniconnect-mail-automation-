/**
 * Fee Collection auto-sync worker.
 *
 * Runs every minute. For each fee_period where auto_sync_enabled = true
 * and (now - last_synced_at) >= interval_minutes, fires the app's
 * sync endpoint to refresh data from Google Sheets.
 *
 * Uses an internal token shared between worker and app to bypass user auth.
 */
import { getPeriodsDueForSync, recordSyncResult } from '@uniconnect/shared';

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://uniconnect-app.up.railway.app';
const INTERNAL_TOKEN = process.env.INTERNAL_SYNC_TOKEN || '';

let isSyncing = false;
let warnedMissingToken = false;

export async function processFeeAutoSync() {
    if (isSyncing) {
        console.log('[FEE_AUTO_SYNC] Previous run still in progress, skipping');
        return;
    }
    isSyncing = true;

    try {
        const due = await getPeriodsDueForSync();
        if (due.length === 0) return;

        // Hard fail fast if token isn't configured — otherwise the app falls
        // back to checkFeeAccess and returns an HTML login page that breaks
        // res.json() and looks like a confusing "network error".
        if (!INTERNAL_TOKEN) {
            if (!warnedMissingToken) {
                console.error('[FEE_AUTO_SYNC] ❌ INTERNAL_SYNC_TOKEN env var not set on worker — auto-sync disabled until set on BOTH app and worker.');
                warnedMissingToken = true;
            }
            for (const period of due) {
                await recordSyncResult(period.id, null, 'Worker config: INTERNAL_SYNC_TOKEN env var is not set on the worker service. Set it on both app + worker (same value) and redeploy.').catch(() => {});
            }
            return;
        }

        console.log(`[FEE_AUTO_SYNC] ${due.length} period(s) due for sync via ${APP_BASE_URL}`);

        for (const period of due) {
            const t0 = Date.now();
            try {
                const res = await fetch(`${APP_BASE_URL}/api/fees/periods/${period.id}/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'x-internal-sync-token': INTERNAL_TOKEN,
                    },
                });
                const elapsed = Date.now() - t0;
                const contentType = res.headers.get('content-type') || '';
                const bodyText = await res.text();

                if (!res.ok) {
                    const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ');
                    const hint = bodyText.includes('<!doctype') || bodyText.includes('<html')
                        ? ' (got HTML — token likely wrong or APP_BASE_URL points to non-app service)'
                        : '';
                    console.error(`[FEE_AUTO_SYNC] ❌ ${period.name}: HTTP ${res.status}${hint} after ${elapsed}ms: ${snippet}`);
                    await recordSyncResult(period.id, null, `HTTP ${res.status}${hint}: ${snippet}`);
                    continue;
                }

                if (!contentType.includes('application/json')) {
                    const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ');
                    console.error(`[FEE_AUTO_SYNC] ❌ ${period.name}: expected JSON, got ${contentType}: ${snippet}`);
                    await recordSyncResult(period.id, null, `App returned ${contentType || 'unknown content-type'} instead of JSON — check INTERNAL_SYNC_TOKEN matches between app+worker and APP_BASE_URL points to the app: ${snippet}`);
                    continue;
                }

                const summary = JSON.parse(bodyText);
                console.log(`[FEE_AUTO_SYNC] ✅ ${period.name}: ${summary.totalImported || 0} imported in ${elapsed}ms`);
            } catch (e: any) {
                console.error(`[FEE_AUTO_SYNC] ❌ ${period.name}: ${e.message?.slice(0, 200)}`);
                try {
                    await recordSyncResult(period.id, null, `Network error: ${e.message?.slice(0, 200)}`);
                } catch {}
            }
        }
    } catch (e: any) {
        console.error('[FEE_AUTO_SYNC] Loop error:', e.message);
    } finally {
        isSyncing = false;
    }
}
