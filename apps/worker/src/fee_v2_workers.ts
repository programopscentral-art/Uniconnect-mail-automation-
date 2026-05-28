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

import { db, sendEmail } from '@uniconnect/shared';

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://uniconnect-app.up.railway.app';
const INTERNAL_TOKEN = process.env.INTERNAL_SYNC_TOKEN || '';

// Fixed recipients — always copied on the twice-daily snapshot regardless
// of which PM/COS is on the campus.
const FIXED_SNAPSHOT_RECIPIENTS = [
    'pavan.dharma@nxtwave.tech',
    'programopscentral@nxtwave.in',
];

// ── Auto-sync loop ────────────────────────────────────────────────────────

let autoSyncRunning = false;
let autoSyncWarnedToken = false;

async function runAutoSyncCycle(): Promise<void> {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
        const due = await db.query<{ id: string; auto_sync_interval_minutes: number; last_synced_at: string | null }>(
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
        for (const w of due.rows) {
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

interface SnapshotData {
    window_id: string;
    window_name: string;
    totals: {
        students: number; fully_paid: number; partial: number; yet_to_pay: number;
        dropouts: number; total_payable: number; total_paid: number; collection_pct: number;
    };
    per_batch: Array<{
        display_name: string; total: number; fully_paid: number; partial: number;
        yet_to_pay: number; dropouts: number; total_payable: number; total_paid: number;
    }>;
}

async function buildSnapshotForWindow(window_id: string, window_name: string): Promise<SnapshotData> {
    const perBatch = await db.query<{
        display_name: string; total: string; fully_paid: string; partial: string;
        yet_to_pay: string; dropouts: string; total_payable: string; total_paid: string;
    }>(
        `SELECT bp.display_name,
                COUNT(fsp.id)::text                                            AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::text       AS fully_paid,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::text   AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::text       AS yet_to_pay,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::text        AS dropouts,
                COALESCE(SUM(fsp.payable), 0)::text                            AS total_payable,
                COALESCE(SUM(fsp.paid), 0)::text                               AS total_paid
           FROM fee_batch_period bp
           LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
          WHERE bp.window_id = $1
          GROUP BY bp.id, bp.batch_start_year
          ORDER BY bp.batch_start_year DESC`,
        [window_id],
    );

    let students = 0, fully = 0, partial = 0, yet = 0, dropouts = 0;
    let totalPayable = 0, totalPaid = 0;
    const batches = perBatch.rows.map(b => {
        const t = Number(b.total), fp = Number(b.fully_paid), p = Number(b.partial);
        const yt = Number(b.yet_to_pay), dr = Number(b.dropouts);
        const tp = Number(b.total_payable), tpd = Number(b.total_paid);
        students += t; fully += fp; partial += p; yet += yt; dropouts += dr;
        totalPayable += tp; totalPaid += tpd;
        return {
            display_name: b.display_name, total: t, fully_paid: fp, partial: p,
            yet_to_pay: yt, dropouts: dr, total_payable: tp, total_paid: tpd,
        };
    });
    const collectionPct = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

    return {
        window_id, window_name,
        totals: { students, fully_paid: fully, partial, yet_to_pay: yet, dropouts,
                  total_payable: totalPayable, total_paid: totalPaid, collection_pct: collectionPct },
        per_batch: batches,
    };
}

function fmtMoney(v: number): string {
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
    if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)} L`;
    if (v >= 1000)        return `₹${(v / 1000).toFixed(1)} k`;
    return `₹${v.toLocaleString('en-IN')}`;
}

function renderSnapshotHtml(when: 'morning' | 'evening', snap: SnapshotData): string {
    const title = when === 'morning' ? 'Morning fee collection snapshot' : 'Evening fee collection snapshot';
    const batchRows = snap.per_batch.map(b => {
        const pct = b.total_payable > 0 ? Math.round((b.total_paid / b.total_payable) * 100) : 0;
        return `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;">${b.display_name}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${b.total}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#059669;">${b.fully_paid}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#d97706;">${b.partial}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;">${b.yet_to_pay}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmtMoney(b.total_payable)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmtMoney(b.total_paid)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${pct}%</td>
          </tr>`;
    }).join('');
    return `
      <h2 style="font-size:18px;margin:0 0 4px 0;">${title}</h2>
      <div style="color:#6b7280;font-size:13px;margin-bottom:14px;">${snap.window_name}</div>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:18px;">
        <tr>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Students</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;">${snap.totals.students}</td>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Collected</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;color:#059669;">${fmtMoney(snap.totals.total_paid)}</td>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">%</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;color:#059669;">${snap.totals.collection_pct}%</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-top:1px solid #e5e7eb;">Fully paid</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;color:#059669;border-top:1px solid #e5e7eb;">${snap.totals.fully_paid}</td>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-top:1px solid #e5e7eb;">Partial</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;color:#d97706;border-top:1px solid #e5e7eb;">${snap.totals.partial}</td>
          <td style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-top:1px solid #e5e7eb;">Yet to pay</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:700;color:#dc2626;border-top:1px solid #e5e7eb;">${snap.totals.yet_to_pay}</td>
        </tr>
      </table>
      <h3 style="font-size:14px;margin:0 0 8px 0;">Per batch</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 10px;text-align:left;font-weight:600;">Batch</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Total</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Fully</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Partial</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Yet</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Payable</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">Paid</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;">%</th>
          </tr>
        </thead>
        <tbody>${batchRows}</tbody>
      </table>`;
}

async function resolvePmCosRecipients(): Promise<string[]> {
    // PMs assigned to any active campus + every cluster's COS + admins/program_ops
    const r = await db.query<{ email: string }>(
        `WITH ids AS (
            -- PMs from user_campus_assignment
            SELECT DISTINCT uca.user_id FROM ops_os.user_campus_assignment uca
              JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
             WHERE uca.role = 'PM' AND uca.revoked_at IS NULL
            UNION
            -- COS owners
            SELECT DISTINCT cl.cos_user_id FROM ops_os.cluster_dim cl WHERE cl.cos_user_id IS NOT NULL
            UNION
            -- Admins / Program Ops
            SELECT id FROM public.users WHERE role IN ('ADMIN', 'PROGRAM_OPS')
         )
         SELECT DISTINCT u.email FROM ids
           JOIN public.users u ON u.id = ids.user_id
          WHERE u.email IS NOT NULL AND u.email <> ''
            AND (u.is_active IS NULL OR u.is_active = true)`,
    );
    return r.rows.map(r => r.email);
}

let snapshotRunning = false;

async function runSnapshotCycle(): Promise<void> {
    if (snapshotRunning) return;
    snapshotRunning = true;
    try {
        // What's "now" in IST?
        const now = new Date();
        const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
        const ist = new Date(istMs);
        const istHour = ist.getUTCHours();
        const istMin = ist.getUTCMinutes();
        const istDate = ist.toISOString().slice(0, 10);

        // Fire windows: morning 10:00 (allow 10:00-10:14), evening 19:30 (19:30-19:44)
        let kind: 'fee_snapshot_morning' | 'fee_snapshot_evening' | null = null;
        if (istHour === 10 && istMin < 15) kind = 'fee_snapshot_morning';
        else if (istHour === 19 && istMin >= 30 && istMin < 45) kind = 'fee_snapshot_evening';
        if (!kind) return;

        const windows = await db.query<{ id: string; name: string }>(
            `SELECT id, name FROM fee_semester_window WHERE status = 'active'`,
        );
        if (windows.rows.length === 0) return;

        const pmCosEmails = await resolvePmCosRecipients();
        const recipients = Array.from(new Set([...pmCosEmails, ...FIXED_SNAPSHOT_RECIPIENTS]));
        if (recipients.length === 0) return;

        for (const w of windows.rows) {
            // Dedupe per recipient per window per day
            // Reuse ops_os.reminder_dispatch by inserting one row per recipient.
            // ops_os.reminder_dispatch has kind CHECK constraint we need to satisfy.
            // (Note: the constraint allows fee_snapshot kinds because migration
            // 0093's chk_reminder_kind enumerates allowed values — if it doesn't
            // include fee_snapshot_*, we record dedupe in a different way.)
            const snap = await buildSnapshotForWindow(w.id, w.name);
            const subject = `[NIAT Fees] ${kind === 'fee_snapshot_morning' ? 'Morning' : 'Evening'} snapshot · ${w.name}`;
            const intro = `${kind === 'fee_snapshot_morning' ? 'Morning' : 'Evening'} fee collection snapshot`;
            const bodyHtml = renderSnapshotHtml(kind === 'fee_snapshot_morning' ? 'morning' : 'evening', snap);

            for (const email of recipients) {
                // Try to dedupe via a simple key table
                const dedupKey = `fee_${kind}_${w.id}_${istDate}_${email.toLowerCase()}`;
                const ins = await db.query(
                    `INSERT INTO public.notifications (user_id, title, message, type, source_id)
                     SELECT u.id, $2, $3, 'SYSTEM', $4
                       FROM public.users u WHERE u.email = $5
                       AND NOT EXISTS (
                         SELECT 1 FROM public.notifications n2
                          WHERE n2.user_id = u.id AND n2.source_id = $4
                       )
                       LIMIT 1
                     RETURNING id`,
                    [null, subject, `Snapshot for ${w.name}`, dedupKey, email],
                );
                if ((ins.rowCount ?? 0) === 0) continue; // already sent

                // Fire-and-forget email
                sendEmail({
                    to: email,
                    subject,
                    intro,
                    bodyHtml,
                    ctaLabel: 'Open fee collection',
                    ctaUrl: `/fee-collection-v2?window=${w.id}`,
                    tone: 'info',
                }).catch(() => { /* logged inside */ });
            }

            console.log(
                JSON.stringify({
                    ts: new Date().toISOString(), level: 'info',
                    scope: 'fee2.snapshot', msg: 'snapshot_sent',
                    window_id: w.id, kind, recipients: recipients.length,
                }),
            );
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
