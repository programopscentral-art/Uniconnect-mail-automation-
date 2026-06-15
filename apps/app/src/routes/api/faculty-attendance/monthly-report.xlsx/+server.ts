/**
 * GET /api/faculty-attendance/monthly-report.xlsx
 *   ?universityId=<uuid>  (required)
 *   ?year=YYYY            (defaults to current year)
 *   ?month=1..12          (defaults to current month)
 *
 * Detailed monthly faculty-attendance + success-coach report as a styled
 * NIAT-branded XLSX. The workbook contains:
 *
 *   1. Summary             — university name, period, KPIs
 *   2. Faculty Attendance  — one row per instructor with P/A/T/WFH/Leave,
 *                            total sessions, attendance %
 *   3. Day-by-Day Totals   — one row per date in the month with status
 *                            counts (P/A/T/WFH/Leave/Total marked)
 *   4. Success Coaches     — one row per coach with student/parent calls,
 *                            target, attainment %
 *
 * Authorization mirrors the existing /api/faculty-attendance endpoint —
 * checkFacultyAttendanceAccess(locals).
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    db,
    getMonthlyInstructorReport,
    getAttendanceByDate,
    getMonthlyCoachReport,
} from '@uniconnect/shared';
import ExcelJS from 'exceljs';

// Mirrors the access rule in /api/faculty-attendance/+server.ts so this
// endpoint's permission gating stays in lock-step with the data endpoints
// the rest of the page uses.
function checkAccess(locals: App.Locals) {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = (locals.user as any).permissions || [];
    if (role === 'ADMIN' || role === 'PROGRAM_OPS') return;
    if (perms.includes('faculty-attendance')) return;
    throw error(403, 'You do not have access to Faculty Attendance. Ask your admin to enable it.');
}

// NIAT palette — same as fee XLSX
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

export const GET: RequestHandler = async ({ locals, url }) => {
    checkAccess(locals);

    const universityId = url.searchParams.get('universityId') ?? locals.user?.university_id ?? '';
    if (!universityId) throw error(400, 'universityId required');

    const now = new Date();
    const year = parseInt(url.searchParams.get('year') ?? String(now.getFullYear()));
    const month = parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1));
    if (!Number.isFinite(year) || year < 2020 || year > 2100) throw error(400, 'invalid year');
    if (!Number.isFinite(month) || month < 1 || month > 12) throw error(400, 'invalid month');

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Resolve university name + run all three queries in parallel
    const [uniRes, facultyRows, dailyRows, coachRows] = await Promise.all([
        db.query<{ name: string }>(`SELECT name FROM public.universities WHERE id = $1`, [universityId]),
        getMonthlyInstructorReport(universityId, year, month),
        getAttendanceByDate(universityId, startDate, endDate),
        getMonthlyCoachReport(universityId, year, month).catch(() => [] as any[]),
    ]);
    const universityName = uniRes.rows[0]?.name ?? 'University';
    const monthLabel = new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Roll-up totals across faculty
    let tot_present = 0, tot_absent = 0, tot_training = 0, tot_wfh = 0, tot_leave = 0, tot_marked = 0, tot_sessions = 0;
    for (const r of facultyRows as any[]) {
        tot_present  += Number(r.days_present)  || 0;
        tot_absent   += Number(r.days_absent)   || 0;
        tot_training += Number(r.days_training) || 0;
        tot_wfh      += Number(r.days_wfh)      || 0;
        tot_leave    += Number(r.days_leave)    || 0;
        tot_marked   += Number(r.total_marked)  || 0;
        tot_sessions += Number(r.total_sessions)|| 0;
    }
    const attendancePct = tot_marked > 0 ? Math.round((tot_present / tot_marked) * 100) : null;

    let tot_student_calls = 0, tot_parent_calls = 0, tot_target = 0;
    for (const c of coachRows as any[]) {
        tot_student_calls += Number(c.total_student_calls) || 0;
        tot_parent_calls  += Number(c.total_parent_calls)  || 0;
        tot_target        += Number(c.total_target)        || 0;
    }
    const totalCalls = tot_student_calls + tot_parent_calls;
    const coachAttainmentPct = tot_target > 0 ? Math.round((totalCalls / tot_target) * 100) : null;

    // ── Build workbook ────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'UniConnect Operations OS';
    wb.created = new Date();

    // 1. Summary
    {
        const ws = wb.addWorksheet('Summary', { properties: { defaultRowHeight: 18 } });
        ws.columns = [
            { header: 'Metric', key: 'metric', width: 36 },
            { header: 'Value',  key: 'value',  width: 24 },
        ];
        styleHeader(ws.getRow(1));

        ws.getRow(2).getCell(1).value = `Faculty Attendance Report · ${universityName}`;
        ws.getRow(2).getCell(1).font = { name: 'Calibri', size: 14, bold: true };
        ws.mergeCells('A2:B2');
        ws.getRow(3).getCell(1).value = `${monthLabel}  (${startDate} → ${endDate})`;
        ws.getRow(3).getCell(1).font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };
        ws.mergeCells('A3:B3');

        const rows: Array<[string, string | number | null]> = [
            ['Total faculty', facultyRows.length],
            ['Days with any attendance recorded', dailyRows.length],
            ['Present (sum)', tot_present],
            ['Absent (sum)', tot_absent],
            ['Training (sum)', tot_training],
            ['WFH (sum)', tot_wfh],
            ['On leave (sum)', tot_leave],
            ['Total markings', tot_marked],
            ['Attendance %', attendancePct === null ? '—' : `${attendancePct}%`],
            ['Total sessions taken', tot_sessions],
            ['', ''],
            ['Total coaches', coachRows.length],
            ['Total student calls', tot_student_calls],
            ['Total parent calls', tot_parent_calls],
            ['Total calls', totalCalls],
            ['Total daily-target (sum)', tot_target],
            ['Coach target attainment %', coachAttainmentPct === null ? '—' : `${coachAttainmentPct}%`],
        ];
        rows.forEach((d, i) => {
            const row = ws.addRow({ metric: d[0], value: d[1] });
            styleStripe(row, i % 2 === 1);
        });
        ws.views = [{ state: 'frozen', ySplit: 4 }];
    }

    // 2. Faculty Attendance per-instructor
    {
        const ws = wb.addWorksheet('Faculty Attendance', { properties: { defaultRowHeight: 18 } });
        ws.columns = [
            { header: 'Instructor',  key: 'name',     width: 28 },
            { header: 'Designation', key: 'desig',    width: 22 },
            { header: 'Department',  key: 'dept',     width: 20 },
            { header: 'Subjects',    key: 'subj',     width: 28 },
            { header: 'Present',     key: 'p',        width: 10 },
            { header: 'Absent',      key: 'a',        width: 10 },
            { header: 'Training',    key: 't',        width: 10 },
            { header: 'WFH',         key: 'wfh',      width: 10 },
            { header: 'Leave',       key: 'lv',       width: 10 },
            { header: 'Total Marked', key: 'tm',      width: 14 },
            { header: 'Sessions',    key: 'sess',     width: 11 },
            { header: 'Attendance %', key: 'pct',     width: 14 },
        ];
        styleHeader(ws.getRow(1));

        if (facultyRows.length === 0) {
            const row = ws.addRow({ name: `(no faculty attendance recorded for ${universityName} in ${monthLabel})` });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            (facultyRows as any[]).forEach((r, i) => {
                const present = Number(r.days_present) || 0;
                const totalMarked = Number(r.total_marked) || 0;
                const pct = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : null;
                const row = ws.addRow({
                    name:  r.name ?? '—',
                    desig: r.designation ?? '—',
                    dept:  r.department ?? '—',
                    subj:  Array.isArray(r.subjects) && r.subjects.length ? r.subjects.join(', ') : (Array.isArray(r.all_subjects_taught) ? r.all_subjects_taught.join(', ') : '—'),
                    p:     present,
                    a:     Number(r.days_absent)   || 0,
                    t:     Number(r.days_training) || 0,
                    wfh:   Number(r.days_wfh)      || 0,
                    lv:    Number(r.days_leave)    || 0,
                    tm:    totalMarked,
                    sess:  Number(r.total_sessions) || 0,
                    pct:   pct === null ? '—' : `${pct}%`,
                });
                styleStripe(row, i % 2 === 1);
            });
            const totals = ws.addRow({
                name: 'TOTAL', desig: '', dept: '', subj: '',
                p: tot_present, a: tot_absent, t: tot_training,
                wfh: tot_wfh, lv: tot_leave, tm: tot_marked,
                sess: tot_sessions,
                pct: attendancePct === null ? '—' : `${attendancePct}%`,
            });
            styleTotals(totals);
        }
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
    }

    // 3. Day-by-Day Totals
    {
        const ws = wb.addWorksheet('Day-by-Day', { properties: { defaultRowHeight: 18 } });
        ws.columns = [
            { header: 'Date',         key: 'date',  width: 14 },
            { header: 'Weekday',      key: 'day',   width: 12 },
            { header: 'Present',      key: 'p',     width: 10 },
            { header: 'Absent',       key: 'a',     width: 10 },
            { header: 'Training',     key: 't',     width: 10 },
            { header: 'WFH',          key: 'wfh',   width: 10 },
            { header: 'On Leave',     key: 'lv',    width: 10 },
            { header: 'Total Marked', key: 'tm',    width: 14 },
        ];
        styleHeader(ws.getRow(1));

        if (dailyRows.length === 0) {
            const row = ws.addRow({ date: `(no attendance recorded for ${universityName} in ${monthLabel})` });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            (dailyRows as any[]).forEach((r, i) => {
                const dStr = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
                const weekday = new Date(dStr + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short' });
                const row = ws.addRow({
                    date: dStr,
                    day:  weekday,
                    p:    Number(r.present)     || 0,
                    a:    Number(r.absent)      || 0,
                    t:    Number(r.training)    || 0,
                    wfh:  Number(r.wfh)         || 0,
                    lv:   Number(r.on_leave)    || 0,
                    tm:   Number(r.total_marked)|| 0,
                });
                styleStripe(row, i % 2 === 1);
            });
        }
        ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    }

    // 4. Success Coaches
    {
        const ws = wb.addWorksheet('Success Coaches', { properties: { defaultRowHeight: 18 } });
        ws.columns = [
            { header: 'Coach',           key: 'name',    width: 28 },
            { header: 'Email',           key: 'email',   width: 30 },
            { header: 'Daily target',    key: 'dtgt',    width: 14 },
            { header: 'Days logged',     key: 'days',    width: 13 },
            { header: 'Student calls',   key: 'sc',      width: 14 },
            { header: 'Parent calls',    key: 'pc',      width: 13 },
            { header: 'Total calls',     key: 'tc',      width: 12 },
            { header: 'Target (sum)',    key: 'tgt',     width: 13 },
            { header: 'Attainment %',    key: 'pct',     width: 14 },
        ];
        styleHeader(ws.getRow(1));

        if (coachRows.length === 0) {
            const row = ws.addRow({ name: `(no coach activity recorded for ${universityName} in ${monthLabel})` });
            row.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
        } else {
            (coachRows as any[]).forEach((r, i) => {
                const total = Number(r.total_calls) || (Number(r.total_student_calls) + Number(r.total_parent_calls));
                const target = Number(r.total_target) || 0;
                const pct = target > 0 ? Math.round((total / target) * 100) : null;
                const row = ws.addRow({
                    name:  r.name ?? '—',
                    email: r.email ?? '—',
                    dtgt:  Number(r.daily_call_target) || 0,
                    days:  Number(r.days_logged)       || 0,
                    sc:    Number(r.total_student_calls) || 0,
                    pc:    Number(r.total_parent_calls)  || 0,
                    tc:    total,
                    tgt:   target,
                    pct:   pct === null ? '—' : `${pct}%`,
                });
                styleStripe(row, i % 2 === 1);
            });
            const tot = ws.addRow({
                name: 'TOTAL', email: '', dtgt: '', days: '',
                sc: tot_student_calls, pc: tot_parent_calls,
                tc: totalCalls, tgt: tot_target,
                pct: coachAttainmentPct === null ? '—' : `${coachAttainmentPct}%`,
            });
            styleTotals(tot);
        }
        ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const safeUni = universityName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const filename = `faculty-report-${safeUni}-${monthStr}.xlsx`;

    return new Response(buf as ArrayBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    });
};
