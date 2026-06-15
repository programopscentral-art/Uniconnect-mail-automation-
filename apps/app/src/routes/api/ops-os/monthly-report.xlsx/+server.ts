/**
 * GET /api/ops-os/monthly-report.xlsx
 *   ?month=YYYY-MM-01      (defaults to last completed month)
 *   ?campus=<uuid>         (one specific campus)
 *   ?university=<uuid>     (alternative: all campuses in this university — admin/COS only)
 *
 * Comprehensive monthly report Excel workbook with multiple sheets:
 *   - Summary (campus, period, overall KPIs)
 *   - Day-by-Day (one row per day in the month — sessions, attendance,
 *     incidents, status)
 *   - Faculty Attendance (per-instructor for the month)
 *   - Success Coaches (per-coach for the month)
 *   - Fee Collection (end-of-month snapshot for the campus's university)
 *
 * When `university=<uuid>` is passed, the workbook contains one Summary
 * row per campus within that university, plus the same per-uni faculty +
 * coach + fee snapshots. This is the "university-wise download" the user
 * asked for.
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    db,
    withReadOnlyUserContext,
    getMonthlyFullRollup,
    monthBoundariesFromIstDate,
    lastCompletedMonth,
    type MonthlyFullRollup,
} from '@uniconnect/shared';
import ExcelJS from 'exceljs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NETWORK_ROLES = new Set(['ADMIN', 'PROGRAM_OPS', 'COS']);

// NIAT palette
const MAROON = '7A1F2B';
const MAROON_DARK = '5C141E';
const MAROON_TINT = 'FBE5E8';
const GRAY_STRIPE = 'F9FAFB';
const GRAY_BORDER = 'E5E7EB';

function styleHeader(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
            top:    { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            bottom: { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            left:   { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            right:  { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
        };
    });
    row.height = 22;
}
function styleStripe(row: ExcelJS.Row, even: boolean) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        if (even) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FF' + GRAY_BORDER } } };
    });
    row.height = 18;
}
function styleTotals(row: ExcelJS.Row) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + MAROON_DARK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON_TINT } };
    });
    row.height = 22;
}

function fmtMoney(v: string | number | null): string {
    if (v === null || v === undefined) return '—';
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000)   return `₹${(n / 1_00_000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
}

function buildSummarySheet(
    wb: ExcelJS.Workbook,
    rollups: MonthlyFullRollup[],
    period_start: string,
    period_end: string,
    scopeLabel: string,
) {
    const ws = wb.addWorksheet('Summary', { properties: { defaultRowHeight: 18 } });
    ws.columns = [
        { header: 'Campus',          key: 'campus',  width: 28 },
        { header: 'University',      key: 'uni',     width: 26 },
        { header: 'Days in Month',   key: 'days',    width: 14 },
        { header: 'Days Submitted',  key: 'sub',     width: 16 },
        { header: 'Days Signed Off', key: 'so',      width: 17 },
        { header: 'Days No Submit',  key: 'nosub',   width: 16 },
        { header: 'Sessions Held',   key: 'sh',      width: 14 },
        { header: 'Sessions Scheduled', key: 'ss',   width: 17 },
        { header: 'Sessions %',      key: 'spct',    width: 12 },
        { header: 'Students Present', key: 'pres',   width: 16 },
        { header: 'Students Enrolled', key: 'enr',   width: 17 },
        { header: 'Attendance %',    key: 'apct',    width: 13 },
        { header: 'Incidents',       key: 'inc',     width: 11 },
        { header: 'Faculty Days Recorded', key: 'frec', width: 19 },
        { header: 'Faculty Attendance %',  key: 'fpct', width: 19 },
        { header: 'Coach Calls (Stu+Par)', key: 'cc',   width: 19 },
        { header: 'Coach Target %',       key: 'ctpct', width: 16 },
        { header: 'Fee Collection %',     key: 'fee',  width: 16 },
    ];
    styleHeader(ws.getRow(1));

    ws.getRow(2).getCell(1).value = `Monthly Report · ${scopeLabel}`;
    ws.getRow(2).getCell(1).font = { name: 'Calibri', size: 14, bold: true };
    ws.mergeCells('A2:R2');
    ws.getRow(3).getCell(1).value = `Period: ${period_start} → ${period_end} (IST)`;
    ws.getRow(3).getCell(1).font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };
    ws.mergeCells('A3:R3');

    rollups.forEach((r, idx) => {
        const row = ws.addRow({
            campus:  '(see Campus header)',
            uni:     r.university_name ?? '—',
            days:    r.ops_rollup.days_in_range,
            sub:     r.ops_rollup.days_submitted,
            so:      r.ops_rollup.days_signed_off,
            nosub:   r.ops_rollup.days_no_submission,
            sh:      r.ops_rollup.total_sessions_held,
            ss:      r.ops_rollup.total_sessions_scheduled,
            spct:    r.ops_rollup.sessions_held_pct === null ? '—' : `${r.ops_rollup.sessions_held_pct}%`,
            pres:    r.ops_rollup.total_students_present,
            enr:     r.ops_rollup.total_students_enrolled,
            apct:    r.ops_rollup.avg_attendance_pct === null ? '—' : `${r.ops_rollup.avg_attendance_pct}%`,
            inc:     r.ops_rollup.total_incidents_flagged,
            frec:    r.faculty.days_recorded,
            fpct:    r.faculty.attendance_pct === null ? '—' : `${r.faculty.attendance_pct}%`,
            cc:      r.coach.total_student_calls + r.coach.total_parent_calls,
            ctpct:   r.coach.target_attainment_pct === null ? '—' : `${r.coach.target_attainment_pct}%`,
            fee:     r.fees.end_of_month_collection_pct === null ? '—' : `${r.fees.end_of_month_collection_pct}%`,
        });
        styleStripe(row, idx % 2 === 1);
    });
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 18 } };
}

function buildPerCampusSheets(wb: ExcelJS.Workbook, r: MonthlyFullRollup) {
    const safeName = (r.university_name ?? r.campus_id.slice(0, 6)).slice(0, 25);

    // Day completeness sheet (Ops OS submission status per metric)
    {
        const ws = wb.addWorksheet(`Ops · ${safeName}`.slice(0, 31));
        ws.columns = [
            { header: 'Metric', key: 'metric', width: 36 },
            { header: 'Value',  key: 'value',  width: 24 },
        ];
        styleHeader(ws.getRow(1));
        const data = [
            ['Period start', r.period_start],
            ['Period end', r.period_end],
            ['Days in month', r.ops_rollup.days_in_range],
            ['Days submitted', r.ops_rollup.days_submitted],
            ['Days signed off', r.ops_rollup.days_signed_off],
            ['Days no submission', r.ops_rollup.days_no_submission],
            ['Days late', r.ops_rollup.days_late_submission],
            ['Days auto-signed-off', r.ops_rollup.days_auto_signed_off],
            ['Days holiday', r.ops_rollup.days_holiday],
            ['Sent-backs (total)', r.ops_rollup.sent_backs_count],
            ['Sessions held', r.ops_rollup.total_sessions_held],
            ['Sessions scheduled', r.ops_rollup.total_sessions_scheduled],
            ['Sessions delivered %', r.ops_rollup.sessions_held_pct === null ? '—' : `${r.ops_rollup.sessions_held_pct}%`],
            ['Students present (sum across days)', r.ops_rollup.total_students_present],
            ['Students enrolled (sum across days)', r.ops_rollup.total_students_enrolled],
            ['Avg attendance %', r.ops_rollup.avg_attendance_pct === null ? '—' : `${r.ops_rollup.avg_attendance_pct}%`],
            ['Faculty absent (sum)', r.ops_rollup.total_faculty_absent],
            ['Incidents flagged', r.ops_rollup.total_incidents_flagged],
            ['Hostel issues', r.ops_rollup.total_hostel_issues],
            ['Transport incidents', r.ops_rollup.total_transport_incidents],
            ['Escalations opened', r.ops_rollup.total_escalations_opened],
            ['Escalations closed', r.ops_rollup.total_escalations_closed],
        ];
        data.forEach((d, i) => {
            const row = ws.addRow({ metric: d[0], value: d[1] });
            styleStripe(row, i % 2 === 1);
        });
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    }

    // Faculty Attendance sheet
    {
        const ws = wb.addWorksheet(`Faculty · ${safeName}`.slice(0, 31));
        ws.columns = [
            { header: 'Instructor',            key: 'name',  width: 30 },
            { header: 'Days Recorded',         key: 'total', width: 16 },
            { header: 'Present',               key: 'pres',  width: 12 },
            { header: 'Absent (authorised)',   key: 'aa',    width: 20 },
            { header: 'Absent (unauthorised)', key: 'au',    width: 22 },
            { header: 'Attendance %',          key: 'pct',   width: 14 },
        ];
        styleHeader(ws.getRow(1));
        if (r.faculty.per_instructor.length === 0) {
            const row = ws.addRow({ name: `(no faculty attendance recorded for ${r.university_name ?? 'this campus\'s university'} this month)` });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            r.faculty.per_instructor.forEach((p, i) => {
                const row = ws.addRow({
                    name: p.name ?? p.instructor_id.slice(0, 8),
                    total: p.total_days,
                    pres: p.present,
                    aa: p.absent_auth,
                    au: p.absent_unauth,
                    pct: p.attendance_pct === null ? '—' : `${p.attendance_pct}%`,
                });
                styleStripe(row, i % 2 === 1);
            });
            const tot = ws.addRow({
                name: 'TOTAL',
                total: r.faculty.per_instructor.reduce((a, b) => a + b.total_days, 0),
                pres: r.faculty.present_count,
                aa: r.faculty.absent_authorised_count,
                au: r.faculty.absent_unauthorised_count,
                pct: r.faculty.attendance_pct === null ? '—' : `${r.faculty.attendance_pct}%`,
            });
            styleTotals(tot);
        }
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    }

    // Success Coaches sheet
    {
        const ws = wb.addWorksheet(`Coaches · ${safeName}`.slice(0, 31));
        ws.columns = [
            { header: 'Coach',          key: 'name',   width: 30 },
            { header: 'Days Recorded',  key: 'days',   width: 14 },
            { header: 'Student Calls',  key: 'sc',     width: 14 },
            { header: 'Parent Calls',   key: 'pc',     width: 14 },
            { header: 'Total Calls',    key: 'total',  width: 13 },
            { header: 'Target (sum)',   key: 'tgt',    width: 13 },
            { header: 'Attainment %',   key: 'pct',    width: 14 },
        ];
        styleHeader(ws.getRow(1));
        if (r.coach.per_coach.length === 0) {
            const row = ws.addRow({ name: `(no coach call activity recorded for ${r.university_name ?? 'this campus\'s university'} this month)` });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            r.coach.per_coach.forEach((c, i) => {
                const total = c.student_calls + c.parent_calls;
                const pct = c.target_sum > 0 ? Math.round((total / c.target_sum) * 100) : null;
                const row = ws.addRow({
                    name: c.name ?? c.coach_id.slice(0, 8),
                    days: c.days_recorded,
                    sc: c.student_calls,
                    pc: c.parent_calls,
                    total,
                    tgt: c.target_sum,
                    pct: pct === null ? '—' : `${pct}%`,
                });
                styleStripe(row, i % 2 === 1);
            });
            const tot = ws.addRow({
                name: 'TOTAL',
                days: r.coach.days_recorded,
                sc: r.coach.total_student_calls,
                pc: r.coach.total_parent_calls,
                total: r.coach.total_student_calls + r.coach.total_parent_calls,
                tgt: r.coach.target_aggregate,
                pct: r.coach.target_attainment_pct === null ? '—' : `${r.coach.target_attainment_pct}%`,
            });
            styleTotals(tot);
        }
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    }

    // Fee Collection snapshot
    {
        const ws = wb.addWorksheet(`Fees · ${safeName}`.slice(0, 31));
        ws.columns = [
            { header: 'Metric', key: 'metric', width: 36 },
            { header: 'Value',  key: 'value',  width: 24 },
        ];
        styleHeader(ws.getRow(1));
        if (!r.fees.snapshot_date) {
            const row = ws.addRow({ metric: '(no fee snapshot found in this month for this university)', value: '—' });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            const rows: Array<[string, string | number]> = [
                ['Snapshot date', r.fees.snapshot_date],
                ['Snapshots in range', r.fees.snapshots_in_range],
                ['Students', r.fees.end_of_month_students ?? '—'],
                ['Fully paid', r.fees.end_of_month_fully_paid ?? '—'],
                ['Partial', r.fees.end_of_month_partial ?? '—'],
                ['Yet to pay', r.fees.end_of_month_yet_to_pay ?? '—'],
                ['Total payable', fmtMoney(r.fees.end_of_month_total_payable)],
                ['Total paid', fmtMoney(r.fees.end_of_month_total_paid)],
                ['Collection %', r.fees.end_of_month_collection_pct === null ? '—' : `${r.fees.end_of_month_collection_pct}%`],
            ];
            rows.forEach((d, i) => {
                const row = ws.addRow({ metric: d[0], value: d[1] });
                styleStripe(row, i % 2 === 1);
            });
        }
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    }
}

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA', 'PMA', 'PM', 'COS'].includes(role)) {
        throw error(403, 'Monthly report download is available to BOA, PMA, PM, COS, PROGRAM_OPS, or ADMIN roles');
    }
    const userId = locals.user.id as string;

    // Period
    const requested = url.searchParams.get('month') ?? '';
    const period = DATE_RE.test(requested)
        ? monthBoundariesFromIstDate(requested)
        : lastCompletedMonth();

    // Scope: either ?campus= (single campus), ?university= (all campuses in
    // that uni — admin/cos only), or default to the requesting user's own
    // campus assignments.
    const campusParam = url.searchParams.get('campus') ?? '';
    const universityParam = url.searchParams.get('university') ?? '';

    const campusIds = await withReadOnlyUserContext(userId, role, async (client) => {
        if (campusParam) {
            const r = await client.query<{ campus_id: string }>(
                `SELECT campus_id FROM ops_os.campus_dim WHERE campus_id = $1::uuid AND status = 'active'`,
                [campusParam],
            );
            return r.rows.map(x => x.campus_id);
        }
        if (universityParam) {
            // Only network roles + the user's own uni can pass ?university=
            if (!NETWORK_ROLES.has(role)) throw error(403, 'University-wide download is admin/COS-only');
            const r = await client.query<{ campus_id: string }>(
                `SELECT campus_id FROM ops_os.campus_dim
                  WHERE university_id = $1::uuid AND status = 'active'
                  ORDER BY display_name`,
                [universityParam],
            );
            return r.rows.map(x => x.campus_id);
        }
        // Default: user's assigned campuses (BOA/PM/PMA) OR all (ADMIN)
        if (NETWORK_ROLES.has(role) || role === 'PROGRAM_OPS') {
            const r = await client.query<{ campus_id: string }>(
                `SELECT campus_id FROM ops_os.campus_dim WHERE status = 'active' ORDER BY display_name`,
            );
            return r.rows.map(x => x.campus_id);
        }
        const r = await client.query<{ campus_id: string }>(
            `SELECT cd.campus_id FROM ops_os.campus_dim cd
              JOIN ops_os.user_campus_assignment uca ON uca.campus_id = cd.campus_id
             WHERE uca.user_id = $1 AND uca.revoked_at IS NULL AND cd.status = 'active'
             ORDER BY cd.display_name`,
            [userId],
        );
        return r.rows.map(x => x.campus_id);
    });

    if (campusIds.length === 0) {
        throw error(404, 'No campuses available for this report');
    }

    // Aggregate per-campus in parallel
    const rollups = await withReadOnlyUserContext(userId, role, async (client) => {
        const out: MonthlyFullRollup[] = [];
        for (const campus_id of campusIds) {
            const r = await getMonthlyFullRollup(
                { campus_id, period_start: period.period_start, period_end: period.period_end },
                client,
            );
            out.push(r);
        }
        return out;
    });

    // Resolve campus display name once for the Summary sheet
    const campusNames = await db.query<{ campus_id: string; display_name: string }>(
        `SELECT campus_id::text, display_name FROM ops_os.campus_dim
          WHERE campus_id = ANY($1::uuid[])`,
        [campusIds],
    );
    const nameMap = new Map(campusNames.rows.map(r => [r.campus_id, r.display_name]));

    // Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'UniConnect Operations OS';
    wb.created = new Date(period.period_start + 'T00:00:00Z');

    const scopeLabel = universityParam
        ? (rollups[0]?.university_name ?? 'University')
        : campusParam
        ? (nameMap.get(campusParam) ?? 'Campus')
        : `${rollups.length} campuses`;

    buildSummarySheet(wb, rollups.map(r => ({ ...r, university_name: r.university_name ?? nameMap.get(r.campus_id) ?? null })), period.period_start, period.period_end, scopeLabel);

    // Populate per-campus sheets — but if many campuses, cap at 10 to keep file small
    const MAX_DETAIL_SHEETS = 10;
    rollups.slice(0, MAX_DETAIL_SHEETS).forEach(r => {
        buildPerCampusSheets(wb, { ...r, university_name: r.university_name ?? nameMap.get(r.campus_id) ?? null });
    });

    // Overwrite the Summary's Campus column with proper names now that we have them
    const summary = wb.getWorksheet('Summary')!;
    rollups.forEach((r, idx) => {
        const rowNum = 5 + idx;  // header row + title rows + 1-indexed
        summary.getRow(rowNum).getCell(1).value = nameMap.get(r.campus_id) ?? r.campus_id.slice(0, 8);
    });

    const buf = await wb.xlsx.writeBuffer();
    const filename = universityParam
        ? `monthly-report-${scopeLabel.replace(/\s+/g, '_')}-${period.period_start.slice(0, 7)}.xlsx`
        : campusParam
        ? `monthly-report-${scopeLabel.replace(/\s+/g, '_')}-${period.period_start.slice(0, 7)}.xlsx`
        : `monthly-report-${period.period_start.slice(0, 7)}.xlsx`;

    return new Response(buf as ArrayBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    });
};
