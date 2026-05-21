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

export async function processFeeAutoSync() {
    if (isSyncing) {
        console.log('[FEE_AUTO_SYNC] Previous run still in progress, skipping');
        return;
    }
    isSyncing = true;

    try {
        const due = await getPeriodsDueForSync();
        if (due.length === 0) return;

        console.log(`[FEE_AUTO_SYNC] ${due.length} period(s) due for sync`);

        for (const period of due) {
            const t0 = Date.now();
            try {
                const res = await fetch(`${APP_BASE_URL}/api/fees/periods/${period.id}/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-sync-token': INTERNAL_TOKEN,
                    },
                });
                const elapsed = Date.now() - t0;
                if (!res.ok) {
                    const errText = await res.text().catch(() => 'unknown');
                    console.error(`[FEE_AUTO_SYNC] ❌ ${period.name}: HTTP ${res.status} after ${elapsed}ms: ${errText.slice(0, 200)}`);
                    await recordSyncResult(period.id, null, `HTTP ${res.status}: ${errText.slice(0, 200)}`);
                } else {
                    const summary = await res.json();
                    console.log(`[FEE_AUTO_SYNC] ✅ ${period.name}: ${summary.totalImported || 0} imported in ${elapsed}ms`);
                }
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
