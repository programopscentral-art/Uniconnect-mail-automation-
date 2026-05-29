/**
 * Fee Collection v2 — worker loops.
 *
 * Two recurring jobs, both setInterval-driven (not BullMQ).
 *
 * 1. Auto-sync — every minute, scans fee_semester_window rows where
 *    auto_sync_enabled = true and (now - last_synced_at) >= the row's
 *    interval, then fires POST /api/fees2/windows/:id/sync against the
 *    app with the x-internal-sync-token header (worker→app same pattern
 *    as the legacy fee_auto_sync). Idempotent — a sync that just ran is
 *    skipped.
 *
 * 2. Twice-daily snapshot email — at 10:00 IST and 19:30 IST every day,
 *    for every active window, builds an org-summary + per-batch
 *    breakdown HTML email and dispatches it to PM + COS recipients plus
 *    the fixed recipient list (Pavan + central ops). Dedupes via
 *    ops_os.reminder_dispatch with kind='fee_snapshot_morning' or
 *    'fee_snapshot_evening' so a worker restart doesn't re-send.
 *
 * The actual snapshot computation queries the DB directly (no HTTP call
 * back to the app) — same shape as the /overview endpoint but inlined
 * here so the worker doesn't need the app to be up to send the email.
 */

import { db } from '@uniconnect/shared';

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://uniconnect-app.up.railway.app';
const INTERNAL_TOKEN = process.env.INTERNAL_SYNC_TOKEN || '';

// ── Auto-sync loop ────────────────────────────────────────────────────────

let autoSyncRunning = false;
let autoSyncWarnedToken = false;

async function runAutoSyncCycle(): Promise<void> {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
        const due = await db.query(
            `SELECT id, auto_sync_interval_minutes, last_synced_at::text AS last_synced_at
               FROM fee_semester_window
              WHERE status = 'active'
                AND auto_sync_enabled = true
                AND (last_synced_at IS NULL OR
                     last_synced_at < now() - (auto_sync_interval_minutes || ' minutes')::interval)`,
        );
        if (due.rows.length === 0) return;

        if (!INTERNAL_TOKEN) {
            if (!autoSyncWarnedToken) {
                console.error('[FEE2_AUTO_SYNC] ❌ INTERNAL_SYNC_TOKEN not set — auto-sync disabled.');
                autoSyncWarnedToken = true;
            }
            return;
        }
        for (const w of due.rows as Array<{ id: string }>) {
            try {
                const url = `${APP_BASE_URL}/api/fees2/windows/${w.id}/sync`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-sync-token': INTERNAL_TOKEN },
                });
                if (!res.ok) {
                    const txt = await res.text().catch(() => `HTTP ${res.status}`);
                    console.error(`[FEE2_AUTO_SYNC] sync failed for window ${w.id}: ${txt}`);
                }
            } catch (e) {
                console.error(`[FEE2_AUTO_SYNC] sync error for window ${w.id}:`, (e as Error).message);
            }
        }
    } finally {
        autoSyncRunning = false;
    }
}

// ── Snapshot email loop ───────────────────────────────────────────────────
//
// The snapshot HTML + send logic lives in apps/app (fee_snapshot.ts +
// /api/fees2/windows/:id/send-snapshot). Worker just schedules — every
// minute, check if we're in a fire window (10:00–10:14 IST morning,
// 19:30–19:44 IST evening), and if so POST to the app endpoint with the
// internal token. Single source of truth for what the email looks like.

let snapshotRunning = false;

async function runSnapshotCycle(): Promise<void> {
    if (snapshotRunning) return;
    snapshotRunning = true;
    try {
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const istHour = ist.getUTCHours();
        const istMin = ist.getUTCMinutes();

        let kindParam: 'morning' | 'evening' | null = null;
        if (istHour === 10 && istMin < 15) kindParam = 'morning';
        else if (istHour === 19 && istMin >= 30 && istMin < 45) kindParam = 'evening';
        if (!kindParam) return;

        if (!INTERNAL_TOKEN) {
            console.error('[FEE2_SNAPSHOT] ❌ INTERNAL_SYNC_TOKEN not set — snapshot loop skipped.');
            return;
        }

        const windows = await db.query(
            `SELECT id, name FROM fee_semester_window WHERE status = 'active'`,
        );
        for (const w of windows.rows as Array<{ id: string; name: string }>) {
            try {
                const url = `${APP_BASE_URL}/api/fees2/windows/${w.id}/send-snapshot?kind=${kindParam}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-sync-token': INTERNAL_TOKEN },
                });
                const j: { ok?: boolean; summary?: { recipients_sent: number; recipients_deduped: number; errors: unknown[] }; message?: string } = await res.json().catch(() => ({} as Record<string, never>));
                if (!res.ok) {
                    console.error(`[FEE2_SNAPSHOT] failed for window ${w.id}: ${j.message || `HTTP ${res.status}`}`);
                    continue;
                }
                console.log(JSON.stringify({
                    ts: new Date().toISOString(), level: 'info',
                    scope: 'fee2.snapshot', msg: 'snapshot_fired',
                    window_id: w.id, kind: kindParam,
                    sent: j.summary?.recipients_sent, deduped: j.summary?.recipients_deduped,
                    errors: j.summary?.errors?.length ?? 0,
                }));
            } catch (e) {
                console.error(`[FEE2_SNAPSHOT] error for window ${w.id}:`, (e as Error).message);
            }
        }
    } finally {
        snapshotRunning = false;
    }
}

// ── Loop starters ────────────────────────────────────────────────────────

export function startFeeV2AutoSyncLoop(): void {
    setTimeout(() => runAutoSyncCycle().catch(e => console.error('[FEE2_AUTO_SYNC] initial cycle:', (e as Error).message)), 30 * 1000);
    setInterval(() => runAutoSyncCycle().catch(e => console.error('[FEE2_AUTO_SYNC] cycle:', (e as Error).message)), 60 * 1000);
    console.log('[FEE2_AUTO_SYNC] ✅ Loop started (1-min granularity)');
}

export function startFeeV2SnapshotLoop(): void {
    setTimeout(() => runSnapshotCycle().catch(e => console.error('[FEE2_SNAPSHOT] initial cycle:', (e as Error).message)), 60 * 1000);
    setInterval(() => runSnapshotCycle().catch(e => console.error('[FEE2_SNAPSHOT] cycle:', (e as Error).message)), 60 * 1000);
    console.log('[FEE2_SNAPSHOT] ✅ Loop started (1-min granularity, fires at 10:00 IST + 19:30 IST)');
}
