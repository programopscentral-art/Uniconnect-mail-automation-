/**
 * GET /api/fees2/windows/[id]/report.xlsx
 *
 * Multi-sheet Excel workbook for the fee window. Five sheets:
 *   - Summary       — totals + breakdown + per-status counts
 *   - Per-Batch     — one row per batch with totals row at bottom
 *   - Per-University — collection by university, ordered by payable DESC
 *   - Students      — every student row (the main data dump)
 *   - Dropouts      — fee_dropout_log rows for the window
 *
 * Number formatting (column `z` property) makes ₹ amounts render with
 * thousand separators in Excel; frozen header row (`!views`) keeps the
 * column names visible while scrolling. Column widths set per column
 * so nothing gets truncated on first open.
 *
 * SheetJS community edition doesn't support cell colors/fonts — for
 * THAT level of styling we'd need exceljs or a paid SheetJS. Layout
 * + formatting is what we control.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import * as XLSX from 'xlsx';

const RUPEE_FMT = '"₹"#,##,##0';
const PCT_FMT = '0%';
const DATE_FMT = 'yyyy-mm-dd';

interface SheetCell { v: string | number | null; t?: 'n' | 's'; z?: string; }
function cell(v: string | number | null | undefined, opts: { rupee?: boolean; date?: boolean; bold?: boolean } = {}): SheetCell {
    if (v === null || v === undefined) return { v: '', t: 's' };
    if (typeof v === 'number') return { v, t: 'n', z: opts.rupee ? RUPEE_FMT : undefined };
    return { v: String(v), t: 's' };
}
function pctCell(num: number, denom: number): SheetCell {
    return { v: denom > 0 ? num / denom : 0, t: 'n', z: PCT_FMT };
}

function widenColumns(ws: XLSX.WorkSheet, widths: number[]) {
    (ws as XLSX.WorkSheet & { '!cols': XLSX.ColInfo[] })['!cols'] = widths.map(w => ({ wch: w }));
}
function freezeHeader(ws: XLSX.WorkSheet, rowsAbove: number = 1) {
    (ws as XLSX.WorkSheet & { '!views': unknown[] })['!views'] = [{ ySplit: rowsAbove, state: 'frozen' }];
}

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const wRes = await db.query(`SELECT id, name, sheet_id, last_synced_at::text AS last_synced_at FROM fee_semester_window WHERE id = $1`, [params.id]);
    if (wRes.rows.length === 0) throw error(404, 'window not found');
    const win = wRes.rows[0] as { id: string; name: string; sheet_id: string; last_synced_at: string | null };

    // ── Queries ──────────────────────────────────────────────────────────
    const totalsR = await db.query(
        `SELECT COUNT(fsp.id)::int                                          AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int      AS dropouts,
                COALESCE(SUM(fsp.payable), 0)                               AS payable,
                COALESCE(SUM(fsp.paid), 0)                                  AS paid,
                COALESCE(SUM(fsp.pending), 0)                               AS pending,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Fully Paid'), 0)     AS paid_fully,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Partially Paid'), 0) AS paid_partial
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
          WHERE bp.window_id = $1`,
        [win.id],
    );
    const totals = totalsR.rows[0];

    const perBatchR = await db.query(
        `SELECT bp.display_name, bp.batch_start_year, bp.semester_number,
                COUNT(fsp.id)::int                                          AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int      AS dropouts,
                COALESCE(SUM(fsp.payable), 0)                               AS payable,
                COALESCE(SUM(fsp.paid), 0)                                  AS paid,
                COALESCE(SUM(fsp.pending), 0)                               AS pending
           FROM fee_batch_period bp
           LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
          WHERE bp.window_id = $1
          GROUP BY bp.id
          ORDER BY bp.batch_start_year DESC`,
        [win.id],
    );

    const perUniR = await db.query(
        `SELECT u.name,
                COUNT(fsp.id)::int                                          AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int     AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int     AS yet,
                COALESCE(SUM(fsp.payable), 0)                               AS payable,
                COALESCE(SUM(fsp.paid), 0)                                  AS paid
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           JOIN universities u ON u.id = fsp.university_id
          WHERE bp.window_id = $1
          GROUP BY u.id
          ORDER BY payable DESC`,
        [win.id],
    );

    const studentsR = await db.query(
        `SELECT bp.batch_start_year, bp.semester_number, bp.display_name AS batch_name,
                u.name AS university,
                fsp.zoho_user_id, fsp.student_name,
                fsp.payable, fsp.paid, fsp.pending,
                fsp.previous_fee_due, fsp.current_term_discount,
                fsp.status, fsp.registration_status, fsp.registration_date::text AS registration_date,
                fsp.tag_case, fsp.success_coach_name,
                COALESCE(rc.n, 0) AS remark_count
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           LEFT JOIN universities u ON u.id = fsp.university_id
           LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM fee_remarks fr WHERE fr.student_payment_id = fsp.id) rc ON true
          WHERE bp.window_id = $1
          ORDER BY bp.batch_start_year DESC, u.name, fsp.student_name`,
        [win.id],
    );

    const dropoutsR = await db.query(
        `SELECT fdl.zoho_user_id, fdl.student_name,
                u.name AS university,
                bp.display_name AS batch_name, bp.batch_start_year, bp.semester_number,
                fdl.dropped_at::text AS dropped_at, fdl.reason,
                fdl.imported_at::text AS imported_at
           FROM fee_dropout_log fdl
           LEFT JOIN universities u ON u.id = fdl.university_id
           LEFT JOIN fee_batch_period bp ON bp.id = fdl.batch_period_id
          WHERE fdl.window_id = $1
          ORDER BY COALESCE(fdl.dropped_at, fdl.imported_at::date) DESC, fdl.student_name`,
        [win.id],
    );

    // ── Workbook ─────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' IST';

    // ─── Sheet 1: Summary ───────────────────────────────────────────────
    {
        const aoa: SheetCell[][] = [];
        aoa.push([cell('FEE COLLECTION REPORT')]);
        aoa.push([cell(win.name)]);
        aoa.push([cell(`Generated: ${nowIst}`)]);
        aoa.push([cell(`Sheet source: ${win.sheet_id}`)]);
        aoa.push([cell(win.last_synced_at ? `Last synced: ${new Date(win.last_synced_at).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '')]);
        aoa.push([]);
        aoa.push([cell('PAYMENT BREAKDOWN')]);
        aoa.push([cell('Students'),        cell(Number(totals.total)),     cell(''), cell('Total payable'),  cell(Number(totals.payable),    { rupee: true })]);
        aoa.push([cell('Fully paid'),      cell(Number(totals.fully)),     cell(''), cell('Total collected'), cell(Number(totals.paid),       { rupee: true })]);
        aoa.push([cell('Partially paid'),  cell(Number(totals.partial)),   cell(''), cell('Pending'),        cell(Number(totals.pending),    { rupee: true })]);
        aoa.push([cell('Yet to pay'),      cell(Number(totals.yet)),       cell(''), cell('Collection %'),   pctCell(Number(totals.paid), Number(totals.payable))]);
        aoa.push([cell('Dropouts'),        cell(Number(totals.dropouts))]);
        aoa.push([]);
        aoa.push([cell('SOURCE OF COLLECTION')]);
        aoa.push([cell('From fully-paid students'),  cell(Number(totals.paid_fully),   { rupee: true }), cell(`${Number(totals.fully)} students`)]);
        aoa.push([cell('From partial payments'),     cell(Number(totals.paid_partial), { rupee: true }), cell(`${Number(totals.partial)} students`)]);
        const ws = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v ?? '')));
        // Re-apply cell types + formats
        for (let r = 0; r < aoa.length; r++) {
            for (let c = 0; c < aoa[r].length; c++) {
                const cellRef = XLSX.utils.encode_cell({ r, c });
                const src = aoa[r][c];
                if (!src) continue;
                const target = ws[cellRef];
                if (!target) continue;
                if (src.t) target.t = src.t;
                if (src.z) target.z = src.z;
            }
        }
        widenColumns(ws, [32, 18, 4, 32, 22]);
        // Merge title rows across 5 columns
        (ws as XLSX.WorkSheet & { '!merges': XLSX.Range[] })['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
            { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },
            { s: { r: 6, c: 0 }, e: { r: 6, c: 4 } },
            { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    }

    // ─── Sheet 2: Per-Batch ─────────────────────────────────────────────
    {
        const header = ['Batch', 'Batch Year', 'Semester', 'Total', 'Fully', 'Partial', 'Yet', 'Dropouts', 'Payable', 'Paid', 'Pending', 'Collection %'];
        const aoa: SheetCell[][] = [header.map(h => cell(h))];
        let tPay = 0, tPaid = 0, tTotal = 0, tFully = 0, tPartial = 0, tYet = 0, tDrop = 0, tPend = 0;
        for (const b of perBatchR.rows) {
            const pay = Number(b.payable), paid = Number(b.paid);
            tTotal += Number(b.total); tFully += Number(b.fully); tPartial += Number(b.partial);
            tYet += Number(b.yet); tDrop += Number(b.dropouts); tPay += pay; tPaid += paid; tPend += Number(b.pending);
            aoa.push([
                cell(b.display_name), cell(Number(b.batch_start_year)), cell(Number(b.semester_number)),
                cell(Number(b.total)), cell(Number(b.fully)), cell(Number(b.partial)), cell(Number(b.yet)), cell(Number(b.dropouts)),
                cell(pay, { rupee: true }), cell(paid, { rupee: true }), cell(Number(b.pending), { rupee: true }),
                pctCell(paid, pay),
            ]);
        }
        aoa.push([
            cell('TOTAL'), cell(''), cell(''),
            cell(tTotal), cell(tFully), cell(tPartial), cell(tYet), cell(tDrop),
            cell(tPay, { rupee: true }), cell(tPaid, { rupee: true }), cell(tPend, { rupee: true }),
            pctCell(tPaid, tPay),
        ]);
        const ws = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v ?? '')));
        for (let r = 0; r < aoa.length; r++) for (let c = 0; c < aoa[r].length; c++) {
            const target = ws[XLSX.utils.encode_cell({ r, c })];
            const src = aoa[r][c];
            if (target && src?.t) target.t = src.t;
            if (target && src?.z) target.z = src.z;
        }
        widenColumns(ws, [30, 12, 12, 10, 10, 10, 10, 12, 16, 16, 16, 14]);
        freezeHeader(ws, 1);
        XLSX.utils.book_append_sheet(wb, ws, 'Per Batch');
    }

    // ─── Sheet 3: Per-University ────────────────────────────────────────
    {
        const header = ['University', 'Total', 'Fully', 'Partial', 'Yet', 'Payable', 'Paid', 'Collection %'];
        const aoa: SheetCell[][] = [header.map(h => cell(h))];
        let tPay = 0, tPaid = 0, tTotal = 0, tFully = 0, tPartial = 0, tYet = 0;
        for (const u of perUniR.rows) {
            const pay = Number(u.payable), paid = Number(u.paid);
            tTotal += Number(u.total); tFully += Number(u.fully); tPartial += Number(u.partial);
            tYet += Number(u.yet); tPay += pay; tPaid += paid;
            aoa.push([
                cell(u.name), cell(Number(u.total)), cell(Number(u.fully)), cell(Number(u.partial)), cell(Number(u.yet)),
                cell(pay, { rupee: true }), cell(paid, { rupee: true }), pctCell(paid, pay),
            ]);
        }
        aoa.push([cell('TOTAL'), cell(tTotal), cell(tFully), cell(tPartial), cell(tYet), cell(tPay, { rupee: true }), cell(tPaid, { rupee: true }), pctCell(tPaid, tPay)]);
        const ws = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v ?? '')));
        for (let r = 0; r < aoa.length; r++) for (let c = 0; c < aoa[r].length; c++) {
            const target = ws[XLSX.utils.encode_cell({ r, c })];
            const src = aoa[r][c];
            if (target && src?.t) target.t = src.t;
            if (target && src?.z) target.z = src.z;
        }
        widenColumns(ws, [40, 10, 10, 10, 10, 18, 18, 14]);
        freezeHeader(ws, 1);
        XLSX.utils.book_append_sheet(wb, ws, 'Per University');
    }

    // ─── Sheet 4: Students ──────────────────────────────────────────────
    {
        const header = ['Batch', 'Sem', 'University', 'User ID', 'Student Name', 'Payable', 'Paid', 'Pending', 'Prev Due', 'Discount', 'Status', 'Reg Status', 'Reg Date', 'Tag Case', 'Success Coach', 'Remarks'];
        const aoa: SheetCell[][] = [header.map(h => cell(h))];
        for (const s of studentsR.rows) {
            aoa.push([
                cell(s.batch_name), cell(Number(s.semester_number)), cell(s.university),
                cell(s.zoho_user_id), cell(s.student_name),
                cell(Number(s.payable),               { rupee: true }),
                cell(Number(s.paid),                  { rupee: true }),
                cell(Number(s.pending),               { rupee: true }),
                cell(Number(s.previous_fee_due ?? 0),  { rupee: true }),
                cell(Number(s.current_term_discount ?? 0), { rupee: true }),
                cell(s.status), cell(s.registration_status), cell(s.registration_date),
                cell(s.tag_case), cell(s.success_coach_name),
                cell(Number(s.remark_count)),
            ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v ?? '')));
        for (let r = 0; r < aoa.length; r++) for (let c = 0; c < aoa[r].length; c++) {
            const target = ws[XLSX.utils.encode_cell({ r, c })];
            const src = aoa[r][c];
            if (target && src?.t) target.t = src.t;
            if (target && src?.z) target.z = src.z;
        }
        widenColumns(ws, [28, 6, 28, 38, 28, 14, 14, 14, 12, 12, 14, 20, 12, 22, 22, 10]);
        freezeHeader(ws, 1);
        // Enable Excel's auto filter on the header row
        (ws as XLSX.WorkSheet & { '!autofilter'?: { ref: string } })['!autofilter'] = { ref: `A1:P${aoa.length}` };
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
    }

    // ─── Sheet 5: Dropouts ──────────────────────────────────────────────
    {
        const header = ['User ID', 'Student', 'University', 'Batch', 'Sem', 'Dropped At', 'Reason'];
        const aoa: SheetCell[][] = [header.map(h => cell(h))];
        for (const d of dropoutsR.rows) {
            const droppedDate = d.dropped_at || (d.imported_at ? d.imported_at.slice(0, 10) : '');
            aoa.push([
                cell(d.zoho_user_id), cell(d.student_name), cell(d.university),
                cell(d.batch_name), cell(d.semester_number ? Number(d.semester_number) : ''),
                cell(droppedDate), cell(d.reason),
            ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v ?? '')));
        for (let r = 0; r < aoa.length; r++) for (let c = 0; c < aoa[r].length; c++) {
            const target = ws[XLSX.utils.encode_cell({ r, c })];
            const src = aoa[r][c];
            if (target && src?.t) target.t = src.t;
            if (target && src?.z) target.z = src.z;
        }
        widenColumns(ws, [38, 28, 28, 26, 6, 14, 50]);
        freezeHeader(ws, 1);
        XLSX.utils.book_append_sheet(wb, ws, 'Dropouts');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeName = win.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="fee_collection_${safeName}_${today}.xlsx"`,
            'Cache-Control': 'no-store',
        },
    });
};
