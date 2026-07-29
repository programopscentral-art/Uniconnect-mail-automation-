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
import { getEmailUniversityScope, scopeLabel, getUniversityAvailability, type UniversityScope } from './fee_scope';
import { NIAT_LOGO_B64 } from './niat_logo_b64';

export const FIXED_SNAPSHOT_RECIPIENTS = [
    'karthik@nxtwave.tech',
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

export async function buildSnapshot(
    window_id: string,
    window_name: string,
    scope: UniversityScope = { type: 'all', universityIds: null },
): Promise<SnapshotData> {
    // Scope filter — when 'subset', restrict to those university IDs.
    // When 'all', no filter.
    const params: unknown[] = [window_id];
    let scopeFilter = '';
    if (scope.type === 'subset') {
        params.push(scope.universityIds);
        scopeFilter = ` AND fsp.university_id = ANY($2::uuid[])`;
    }
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
           LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id${scopeFilter}
          WHERE bp.window_id = $1
          GROUP BY bp.id, bp.batch_start_year
          ORDER BY bp.batch_start_year DESC`,
        params,
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

const BASE_URL = (typeof process !== 'undefined' ? process.env.PUBLIC_BASE_URL : '') || 'https://uniconnect-app.up.railway.app';
const MAROON = '#7A1F2B';
const MAROON_DARK = '#5C141E';

/**
 * Render a stacked horizontal bar (table-based for email compatibility).
 * Three segments — fully (emerald) / partial (amber) / yet (red).
 */
function statusBar(fully: number, partial: number, yet: number, total: number): string {
    if (total <= 0) return '';
    const fw = Math.max(0, Math.round((fully / total) * 100));
    const pw = Math.max(0, Math.round((partial / total) * 100));
    const yw = Math.max(0, 100 - fw - pw);
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-radius:6px;overflow:hidden;">
        <tr style="height:12px;">
          ${fw > 0 ? `<td style="width:${fw}%;background:#10b981;line-height:12px;font-size:0;">&nbsp;</td>` : ''}
          ${pw > 0 ? `<td style="width:${pw}%;background:#f59e0b;line-height:12px;font-size:0;">&nbsp;</td>` : ''}
          ${yw > 0 ? `<td style="width:${yw}%;background:#ef4444;line-height:12px;font-size:0;">&nbsp;</td>` : ''}
        </tr>
      </table>`;
}

/** Render a single-segment progress bar (collection %). */
function progressBar(pct: number, height: number = 10): string {
    const p = Math.max(0, Math.min(100, pct));
    const color = pct >= 75 ? '#10b981' : pct >= 25 ? '#f59e0b' : '#ef4444';
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-radius:${height/2}px;overflow:hidden;background:#e5e7eb;">
        <tr style="height:${height}px;">
          <td style="width:${p}%;background:${color};line-height:${height}px;font-size:0;">&nbsp;</td>
          <td style="width:${100 - p}%;line-height:${height}px;font-size:0;">&nbsp;</td>
        </tr>
      </table>`;
}

function renderSnapshotHtml(
    when: 'morning' | 'evening' | 'manual',
    snap: SnapshotData,
    scopeLabel: string | null,
    availability: { withData: string[]; withoutData: string[] } | null,
): string {
    const titleWord = when === 'morning' ? 'Morning' : when === 'evening' ? 'Evening' : 'Live';
    const subtitle = when === 'morning' ? "Today's morning snapshot" : when === 'evening' ? "Today's evening snapshot" : 'On-demand snapshot';
    const downloadUrl = `${BASE_URL}/api/fees2/windows/${snap.window_id}/report.xlsx`;
    const openUrl = `${BASE_URL}/fee-collection-v2?window=${snap.window_id}`;
    // Compact IST timestamp — was bleeding to a second line in the maroon
    // header. "04 Jun · 10:01 IST" fits.
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dateStr = `${String(ist.getUTCDate()).padStart(2,'0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ist.getUTCMonth()]} · ${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')} IST`;

    const batchRows = snap.per_batch.map(b => {
        const pct = b.total_payable > 0 ? Math.round((b.total_paid / b.total_payable) * 100) : 0;
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:500;">${b.display_name}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-variant-numeric:tabular-nums;">${b.total}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#059669;font-weight:600;font-variant-numeric:tabular-nums;">${b.fully_paid}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#b45309;font-weight:600;font-variant-numeric:tabular-nums;">${b.partial}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#b91c1c;font-weight:600;font-variant-numeric:tabular-nums;">${b.yet_to_pay}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-variant-numeric:tabular-nums;">${fmtMoney(b.total_payable)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMoney(b.total_paid)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:${pct >= 75 ? '#059669' : pct >= 25 ? '#b45309' : '#b91c1c'};">${pct}%</td>
          </tr>`;
    }).join('');

    // Visual per-batch progress chart (table-based bars)
    const batchChartRows = snap.per_batch.map(b => {
        const pct = b.total_payable > 0 ? Math.round((b.total_paid / b.total_payable) * 100) : 0;
        return `
          <tr>
            <td style="padding:6px 0;width:30%;color:#374151;font-size:13px;vertical-align:middle;">${b.display_name}</td>
            <td style="padding:6px 12px;vertical-align:middle;">${progressBar(pct, 10)}</td>
            <td style="padding:6px 0;width:60px;text-align:right;font-size:13px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums;">${pct}%</td>
          </tr>`;
    }).join('');

    return `
<!--[if mso]><style>td,div,p{font-family:Arial,sans-serif !important;}</style><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:0;margin:0;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:720px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

      <!-- MAROON HEADER BAR -->
      <tr><td style="background:${MAROON};background-image:linear-gradient(135deg,${MAROON} 0%,${MAROON_DARK} 100%);padding:20px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;width:56px;">
              <img src="${NIAT_LOGO_B64}" alt="NIAT" width="44" height="44" style="display:block;border:0;border-radius:8px;background:#fff;padding:4px;" />
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div style="color:#fde2e6;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:600;">NIAT · Program Operations</div>
              <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:2px;line-height:1.2;">Fee Collection · ${titleWord} Snapshot</div>
              <div style="color:#fde2e6;font-size:11px;margin-top:6px;">${dateStr}</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- WINDOW NAME + SCOPE / COVERAGE -->
      <tr><td style="padding:20px 28px 0 28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#6b7280;font-weight:600;">${subtitle}</div>
        <div style="font-size:22px;font-weight:700;color:#111827;margin-top:2px;">${snap.window_name}</div>
        ${scopeLabel ? `
        <div style="margin-top:8px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;font-size:12px;color:#92400e;">
          <b>${scopeLabel.includes(',') ? 'Universities' : 'University'}:</b> ${scopeLabel}<br/>
          <span style="color:#a16207;font-size:11px;">Totals below are summed across only your assigned campuses.</span>
        </div>` : ''}
        ${availability ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;border-collapse:separate;border-spacing:8px 0;">
          <tr>
            <td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:10px 12px;width:50%;vertical-align:top;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#047857;font-weight:700;margin-bottom:4px;">Universities with data (${availability.withData.length})</div>
              <div style="font-size:11px;color:#065f46;line-height:1.5;">${availability.withData.length > 0 ? availability.withData.join(', ') : '<i>(none yet)</i>'}</div>
            </td>
            <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 12px;width:50%;vertical-align:top;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#b91c1c;font-weight:700;margin-bottom:4px;">Universities without data (${availability.withoutData.length})</div>
              <div style="font-size:11px;color:#7f1d1d;line-height:1.5;">${availability.withoutData.length > 0 ? availability.withoutData.join(', ') : '<i>(none — every registry university has students)</i>'}</div>
            </td>
          </tr>
        </table>` : ''}
      </td></tr>

      <!-- HERO METRICS: 3 columns -->
      <tr><td style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:8px 0;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#065f46 100%);border-radius:10px;padding:18px;width:33%;color:#fff;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#bfdbfe;font-weight:600;">Collection</div>
              <div style="font-size:32px;font-weight:800;margin-top:6px;line-height:1;">${snap.totals.collection_pct}%</div>
              <div style="font-size:13px;color:#dbeafe;margin-top:8px;">${fmtMoney(snap.totals.total_paid)} <span style="color:#93c5fd;">of</span> ${fmtMoney(snap.totals.total_payable)}</div>
            </td>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px;width:33%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#6b7280;font-weight:600;">Students</div>
              <div style="font-size:32px;font-weight:800;margin-top:6px;color:#111827;line-height:1;">${snap.totals.students.toLocaleString('en-IN')}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;">
                <tr>
                  <td style="font-size:11px;color:#059669;font-weight:600;padding-right:8px;">${snap.totals.fully_paid} fully</td>
                  <td style="font-size:11px;color:#b45309;font-weight:600;padding-right:8px;">${snap.totals.partial} part</td>
                  <td style="font-size:11px;color:#b91c1c;font-weight:600;">${snap.totals.yet_to_pay} yet</td>
                </tr>
              </table>
            </td>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px;width:34%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#6b7280;font-weight:600;">Breakdown</div>
              <div style="margin-top:8px;font-size:13px;color:#374151;line-height:1.5;">
                <div><b style="color:#059669;">${fmtMoney(snap.totals.paid_from_fully)}</b> from ${snap.totals.fully_paid} fully paid</div>
                <div style="margin-top:4px;"><b style="color:#b45309;">${fmtMoney(snap.totals.paid_from_partial)}</b> from ${snap.totals.partial} partial</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- STATUS DISTRIBUTION BAR -->
      <tr><td style="padding:0 28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#6b7280;font-weight:600;margin-bottom:6px;">Payment status mix</div>
        ${statusBar(snap.totals.fully_paid, snap.totals.partial, snap.totals.yet_to_pay, Math.max(1, snap.totals.fully_paid + snap.totals.partial + snap.totals.yet_to_pay))}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;">
          <tr>
            <td style="font-size:11px;color:#059669;font-weight:600;"><span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;margin-right:5px;"></span>Fully paid</td>
            <td style="font-size:11px;color:#b45309;font-weight:600;text-align:center;"><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-right:5px;"></span>Partial</td>
            <td style="font-size:11px;color:#b91c1c;font-weight:600;text-align:right;"><span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;margin-right:5px;"></span>Yet to pay</td>
          </tr>
        </table>
      </td></tr>

      <!-- COLLECTION % BY BATCH (visual bars) -->
      <tr><td style="padding:24px 28px 0 28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#6b7280;font-weight:600;margin-bottom:10px;">Collection % by batch</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${batchChartRows}</table>
      </td></tr>

      <!-- PER-BATCH DETAILED TABLE -->
      <tr><td style="padding:24px 28px 0 28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#6b7280;font-weight:600;margin-bottom:8px;">Per-batch detail</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:10px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Batch</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Total</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#059669;border-bottom:1px solid #e5e7eb;">Fully</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#b45309;border-bottom:1px solid #e5e7eb;">Partial</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#b91c1c;border-bottom:1px solid #e5e7eb;">Yet</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Payable</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Paid</th>
              <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">%</th>
            </tr>
          </thead>
          <tbody>${batchRows}</tbody>
        </table>
      </td></tr>

      <!-- CTA BUTTONS -->
      <tr><td style="padding:28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding-right:8px;width:50%;">
              <a href="${downloadUrl}" style="display:block;background:${MAROON};color:#fff;padding:14px 16px;text-align:center;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">⬇ Download full report (.xlsx)</a>
            </td>
            <td style="padding-left:8px;width:50%;">
              <a href="${openUrl}" style="display:block;background:#ffffff;color:${MAROON};padding:13px 16px;text-align:center;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;border:2px solid ${MAROON};">Open in UniConnect →</a>
            </td>
          </tr>
        </table>
        <div style="margin-top:12px;font-size:11px;color:#6b7280;text-align:center;line-height:1.6;">
          The workbook opens in Excel with 5 tabs — Summary, Per-Batch, Per-University, Students, Dropouts —
          with ₹ formatting, totals row, and a frozen header.
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 28px;text-align:center;font-size:11px;color:#6b7280;line-height:1.6;">
        Sent by <b style="color:${MAROON};">UniConnect</b> · Program Operations<br/>
        You are receiving this because you are a PM / COS / Admin on the active fee window.<br/>
        Snapshots fire daily at 10:00 IST and 19:30 IST.
      </td></tr>

    </table>
  </td></tr>
</table>`;
}

/**
 * Resolve the recipient list for fee snapshot emails.
 *
 * Included:
 *   - Active users with role IN ('PM','BOA') who have a non-revoked
 *     assignment to an active, non-operational campus.
 *   - Active COS-lead users (ops_os.cluster_dim.cos_user_id).
 *   - All active users with role IN ('ADMIN','PROGRAM_OPS').
 *   - The FIXED_SNAPSHOT_RECIPIENTS list (Pavan + central ops).
 *
 * Hard-excluded — these roles never receive the snapshot regardless of
 * any assignment they may have:
 *   CMA, CMA_MANAGER, STUDENT, FACULTY, UNIVERSITY_OPERATOR.
 *
 * Operational placeholder universities also excluded so a stray PM/BOA
 * assigned to "Student Engagement Team" / "CRM" / "Central Team"
 * doesn't get pulled in via that assignment alone.
 */
const EXCLUDED_RECIPIENT_ROLES = ['CMA', 'CMA_MANAGER', 'STUDENT', 'FACULTY', 'UNIVERSITY_OPERATOR'];
const OPERATIONAL_PLACEHOLDER_UNIS = ['Student Engagement Team', 'CRM', 'Central Team'];

export async function resolveSnapshotRecipients(): Promise<string[]> {
    const r = await db.query(
        `WITH ids AS (
            SELECT DISTINCT uca.user_id
              FROM ops_os.user_campus_assignment uca
              JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id AND cd.status = 'active'
              JOIN public.universities un ON un.id = cd.university_id
             WHERE uca.role IN ('PM','BOA')
               AND uca.revoked_at IS NULL
               AND un.name <> ALL($1::text[])
            UNION
            SELECT DISTINCT cl.cos_user_id FROM ops_os.cluster_dim cl WHERE cl.cos_user_id IS NOT NULL
            UNION
            SELECT id FROM public.users WHERE role IN ('ADMIN', 'PROGRAM_OPS')
         )
         SELECT DISTINCT u.email FROM ids
           JOIN public.users u ON u.id = ids.user_id
          WHERE u.email IS NOT NULL AND u.email <> ''
            AND (u.is_active IS NULL OR u.is_active = true)
            AND COALESCE(u.role, '') <> ALL($2::text[])`,
        [OPERATIONAL_PLACEHOLDER_UNIS, EXCLUDED_RECIPIENT_ROLES],
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
    const when: 'morning' | 'evening' | 'manual' =
        kind === 'fee_snapshot_morning' ? 'morning' :
        kind === 'fee_snapshot_evening' ? 'evening' : 'manual';
    const labelWhen = when === 'morning' ? 'Morning' : when === 'evening' ? 'Evening' : 'Manual';
    const subject = `[NIAT Fees] ${labelWhen} snapshot · ${w.name}`;
    const intro = `${labelWhen} fee collection snapshot`;

    // Admin recipients get a coverage strip listing which universities
    // have data vs which are empty — computed once, reused for every
    // admin render. Non-admins don't see it (they only see their own).
    const availability = await getUniversityAvailability(w.id);

    // Build one snapshot per unique scope. Cache by scope key so two PMs
    // covering the same campuses share the same rendered body.
    type Cached = { html: string; scopeLabelText: string | null };
    const cache = new Map<string, Cached>();
    async function getCached(scope: UniversityScope): Promise<Cached> {
        const key = scope.type === 'all' ? 'all' : `subset:${[...scope.universityIds].sort().join(',')}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const snap = await buildSnapshot(w.id, w.name, scope);
        const label = await scopeLabel(scope);
        const html = renderSnapshotHtml(when, snap, label, scope.type === 'all' ? availability : null);
        const val = { html, scopeLabelText: label };
        cache.set(key, val);
        return val;
    }

    const result: SnapshotResult = {
        window_id: w.id, kind, recipients_total: recipients.length,
        recipients_sent: 0, recipients_deduped: 0, errors: [],
    };

    for (const email of recipients) {
        const dedupKey = `fee_${kind}_${w.id}_${istDate}_${email.toLowerCase()}`;
        const ins = await db.query(
            `INSERT INTO public.notifications (user_id, title, message, type, source_id, channel, delivery_status, queued_at)
             SELECT u.id, $1, $2, 'SYSTEM', $3, 'EMAIL', 'QUEUED', NOW()
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
        const notificationId = ins.rows[0].id as string;

        // Personalised body per recipient's scope, then send. Honour
        // sendEmail's return value: it never throws, but returns
        // { sent: false, reason } if SMTP isn't configured, fails, etc.
        // Without this, recipients_sent would lie whenever SMTP is silently
        // broken, and delivery_status would stay QUEUED forever.
        let sentOk = false;
        let failReason: string | null = null;
        try {
            const scope = await getEmailUniversityScope(email);
            const { html } = await getCached(scope);
            const r = await sendEmail({
                to: email,
                subject,
                intro,
                bodyHtml: html,
                // The snapshot HTML is a complete, full-width (720px) email in
                // its own right (own header, CTAs, footer). Send it raw — routing
                // it through the 560px Operations-OS card wrapper clipped it so
                // half the layout was invisible.
                wrap: false,
                tone: 'info',
            });
            sentOk = r.sent;
            if (!r.sent) failReason = r.reason ?? 'unknown';
        } catch (e) {
            failReason = (e as Error).message;
        }

        if (sentOk) {
            await db.query(
                `UPDATE public.notifications SET delivery_status = 'SENT', sent_at = NOW() WHERE id = $1`,
                [notificationId],
            );
            result.recipients_sent++;
        } else {
            await db.query(
                `UPDATE public.notifications SET delivery_status = 'FAILED', payload_json = jsonb_build_object('failure_reason', $2::text) WHERE id = $1`,
                [notificationId, failReason ?? 'unknown'],
            );
            result.errors.push({ email, message: failReason ?? 'unknown' });
        }
    }
    return result;
}
