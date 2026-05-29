/**
 * Fee Collection v2 — snapshot email builder.
 *
 * Mirror of the snapshot logic in apps/worker/src/fee_v2_workers.ts so the
 * app can fire snapshots on-demand via an admin endpoint (independent of
 * whether the worker is running). Recipients = PM + COS for any active
 * campus + ADMIN/PROGRAM_OPS + the fixed list (Pavan + central ops).
 *
 * Dedup is per (window, kind, ist-date, recipient) via notifications.source_id
 * — same key scheme as the worker, so a manual fire still prevents the worker
 * from double-sending later in the same day.
 */
import { db, sendEmail } from '@uniconnect/shared';

export const FIXED_SNAPSHOT_RECIPIENTS = [
    'pavan.dharma@nxtwave.tech',
    'programopscentral@nxtwave.in',
];

interface SnapshotData {
    window_id: string;
    window_name: string;
    totals: {
        students: number; fully_paid: number; partial: number; yet_to_pay: number;
        dropouts: number; total_payable: number; total_paid: number; collection_pct: number;
        paid_from_fully: number; paid_from_partial: number;
    };
    per_batch: Array<{
        display_name: string; total: number; fully_paid: number; partial: number;
        yet_to_pay: number; dropouts: number; total_payable: number; total_paid: number;
        paid_from_fully: number; paid_from_partial: number;
    }>;
}

function todayIstDate(): string {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 10);
}

function fmtMoney(v: number): string {
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
    if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)} L`;
    if (v >= 1000)        return `₹${(v / 1000).toFixed(1)} k`;
    return `₹${v.toLocaleString('en-IN')}`;
}

export async function buildSnapshot(window_id: string, window_name: string): Promise<SnapshotData> {
    const perBatch = await db.query(
        `SELECT bp.display_name,
                COUNT(fsp.id)::int                                                          AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int                     AS fully_paid,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int                 AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int                     AS yet_to_pay,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int                      AS dropouts,
                COALESCE(SUM(fsp.payable), 0)                                               AS total_payable,
                COALESCE(SUM(fsp.paid), 0)                                                  AS total_paid,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Fully Paid'), 0)         AS paid_from_fully,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Partially Paid'), 0)     AS paid_from_partial
           FROM fee_batch_period bp
           LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
          WHERE bp.window_id = $1
          GROUP BY bp.id, bp.batch_start_year
          ORDER BY bp.batch_start_year DESC`,
        [window_id],
    );
    let students = 0, fully = 0, partial = 0, yet = 0, dropouts = 0;
    let totalPayable = 0, totalPaid = 0, paidFully = 0, paidPartial = 0;
    const batches = perBatch.rows.map((b: any) => {
        const t = Number(b.total), fp = Number(b.fully_paid), p = Number(b.partial);
        const yt = Number(b.yet_to_pay), dr = Number(b.dropouts);
        const tp = Number(b.total_payable), tpd = Number(b.total_paid);
        const pf = Number(b.paid_from_fully), pp = Number(b.paid_from_partial);
        students += t; fully += fp; partial += p; yet += yt; dropouts += dr;
        totalPayable += tp; totalPaid += tpd; paidFully += pf; paidPartial += pp;
        return { display_name: b.display_name, total: t, fully_paid: fp, partial: p,
                 yet_to_pay: yt, dropouts: dr, total_payable: tp, total_paid: tpd,
                 paid_from_fully: pf, paid_from_partial: pp };
    });
    const collectionPct = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
    return {
        window_id, window_name,
        totals: { students, fully_paid: fully, partial, yet_to_pay: yet, dropouts,
                  total_payable: totalPayable, total_paid: totalPaid, collection_pct: collectionPct,
                  paid_from_fully: paidFully, paid_from_partial: paidPartial },
        per_batch: batches,
    };
}

function renderSnapshotHtml(when: 'morning' | 'evening' | 'manual', snap: SnapshotData): string {
    const title = when === 'morning' ? 'Morning fee collection snapshot'
                : when === 'evening' ? 'Evening fee collection snapshot'
                : 'Fee collection snapshot';
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
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:14px;">
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
      <div style="font-size:12px;color:#374151;margin-bottom:14px;">
        ${fmtMoney(snap.totals.paid_from_fully)} collected from ${snap.totals.fully_paid} fully-paid students ·
        ${fmtMoney(snap.totals.paid_from_partial)} from ${snap.totals.partial} partial payments.
      </div>
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

export async function resolveSnapshotRecipients(): Promise<string[]> {
    const r = await db.query(
        `WITH ids AS (
            SELECT DISTINCT uca.user_id FROM ops_os.user_campus_assignment uca
              JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
             WHERE uca.role = 'PM' AND uca.revoked_at IS NULL
            UNION
            SELECT DISTINCT cl.cos_user_id FROM ops_os.cluster_dim cl WHERE cl.cos_user_id IS NOT NULL
            UNION
            SELECT id FROM public.users WHERE role IN ('ADMIN', 'PROGRAM_OPS')
         )
         SELECT DISTINCT u.email FROM ids
           JOIN public.users u ON u.id = ids.user_id
          WHERE u.email IS NOT NULL AND u.email <> ''
            AND (u.is_active IS NULL OR u.is_active = true)`,
    );
    const pmCos = r.rows.map((r: any) => r.email as string);
    return Array.from(new Set([...pmCos, ...FIXED_SNAPSHOT_RECIPIENTS]));
}

export interface SnapshotResult {
    window_id: string;
    kind: 'fee_snapshot_morning' | 'fee_snapshot_evening' | 'fee_snapshot_manual';
    recipients_total: number;
    recipients_sent: number;
    recipients_deduped: number;
    errors: Array<{ email: string; message: string }>;
}

/**
 * Send (or skip via dedup) the snapshot for one window to all recipients.
 * `kind` controls the dedup key and email subject prefix.
 */
export async function fireSnapshot(window_id: string, kind: SnapshotResult['kind']): Promise<SnapshotResult> {
    const wRes = await db.query(`SELECT id, name FROM fee_semester_window WHERE id = $1 AND status='active'`, [window_id]);
    if (wRes.rows.length === 0) throw new Error('Window not found or not active');
    const w = wRes.rows[0] as { id: string; name: string };

    const recipients = await resolveSnapshotRecipients();
    const istDate = todayIstDate();
    const snap = await buildSnapshot(w.id, w.name);
    const when: 'morning' | 'evening' | 'manual' =
        kind === 'fee_snapshot_morning' ? 'morning' :
        kind === 'fee_snapshot_evening' ? 'evening' : 'manual';
    const labelWhen = when === 'morning' ? 'Morning' : when === 'evening' ? 'Evening' : 'Manual';
    const subject = `[NIAT Fees] ${labelWhen} snapshot · ${w.name}`;
    const intro = `${labelWhen} fee collection snapshot`;
    const bodyHtml = renderSnapshotHtml(when, snap);

    const result: SnapshotResult = {
        window_id: w.id, kind, recipients_total: recipients.length,
        recipients_sent: 0, recipients_deduped: 0, errors: [],
    };

    for (const email of recipients) {
        const dedupKey = `fee_${kind}_${w.id}_${istDate}_${email.toLowerCase()}`;
        const ins = await db.query(
            `INSERT INTO public.notifications (user_id, title, message, type, source_id)
             SELECT u.id, $1, $2, 'SYSTEM', $3
               FROM public.users u WHERE u.email = $4
               AND NOT EXISTS (
                 SELECT 1 FROM public.notifications n2
                  WHERE n2.user_id = u.id AND n2.source_id = $3
               )
               LIMIT 1
             RETURNING id`,
            [subject, `Snapshot for ${w.name}`, dedupKey, email],
        );
        if ((ins.rowCount ?? 0) === 0) { result.recipients_deduped++; continue; }

        try {
            await sendEmail({
                to: email,
                subject,
                intro,
                bodyHtml,
                ctaLabel: 'Open fee collection',
                ctaUrl: `/fee-collection-v2?window=${w.id}`,
                tone: 'info',
            });
            result.recipients_sent++;
        } catch (e) {
            result.errors.push({ email, message: (e as Error).message });
        }
    }
    return result;
}
