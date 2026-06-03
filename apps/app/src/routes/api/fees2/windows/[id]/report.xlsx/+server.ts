/**
 * GET /api/fees2/windows/[id]/report.xlsx
 *
 * NIAT-branded Excel workbook (5 sheets) with proper styling — maroon
 * headers, color-coded status cells, alternating row stripes, bold
 * totals rows, frozen panes, auto-filter, ₹ + % formatting.
 *
 * Uses exceljs (not SheetJS community) because we need cell-level
 * fonts, fills, borders, and alignment.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import ExcelJS from 'exceljs';
import {
    renderStatusDoughnut, renderBatchCollectionChart,
    renderTopUniversitiesChart, renderDropoutReasonsChart, renderTagCaseChart,
} from '$lib/server/fee_chart_renderer';

// NIAT palette
const MAROON = '7A1F2B';
const MAROON_DARK = '5C141E';
const MAROON_TINT = 'FBE5E8';
const EMERALD_BG = 'D1FAE5'; const EMERALD_TX = '047857';
const AMBER_BG   = 'FEF3C7'; const AMBER_TX   = 'B45309';
const RED_BG     = 'FEE2E2'; const RED_TX     = 'B91C1C';
const GRAY_STRIPE = 'F9FAFB';
const GRAY_BORDER = 'E5E7EB';

const RUPEE_FMT = '"₹"#,##,##0;[Red]-"₹"#,##,##0';
const PCT_FMT = '0%';

function setHeaderStyle(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
        cell.border = {
            top:    { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            bottom: { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            left:   { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
            right:  { style: 'thin', color: { argb: 'FF' + MAROON_DARK } },
        };
    });
    row.height = 22;
}
function setStripeStyle(row: ExcelJS.Row, even: boolean) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        if (even) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
        cell.alignment = cell.alignment || { vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FF' + GRAY_BORDER } } };
    });
    row.height = 18;
}
function setTotalsRowStyle(row: ExcelJS.Row) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + MAROON_DARK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON_TINT } };
        cell.border = {
            top:    { style: 'medium', color: { argb: 'FF' + MAROON } },
            bottom: { style: 'medium', color: { argb: 'FF' + MAROON } },
        };
    });
    row.height = 22;
}
function pillCell(cell: ExcelJS.Cell, bg: string, tx: string) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + tx } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
}
function statusPill(cell: ExcelJS.Cell, status: string | null) {
    if (status === 'Fully Paid')      pillCell(cell, EMERALD_BG, EMERALD_TX);
    else if (status === 'Partially Paid') pillCell(cell, AMBER_BG, AMBER_TX);
    else if (status === 'Yet To Pay') pillCell(cell, RED_BG, RED_TX);
}
function pctTextColor(cell: ExcelJS.Cell, pct: number) {
    const tx = pct >= 75 ? EMERALD_TX : pct >= 25 ? AMBER_TX : RED_TX;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + tx } };
}

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const wRes = await db.query(`SELECT id, name, sheet_id, last_synced_at::text AS last_synced_at FROM fee_semester_window WHERE id = $1`, [params.id]);
    if (wRes.rows.length === 0) throw error(404, 'window not found');
    const win = wRes.rows[0] as { id: string; name: string; sheet_id: string; last_synced_at: string | null };

    // ── Queries (same as before, condensed) ─────────────────────────────
    const totals = (await db.query(
        `SELECT COUNT(fsp.id)::int AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int AS yet,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int AS dropouts,
                COALESCE(SUM(fsp.payable), 0) AS payable,
                COALESCE(SUM(fsp.paid), 0) AS paid,
                COALESCE(SUM(fsp.pending), 0) AS pending,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Fully Paid'), 0) AS paid_fully,
                COALESCE(SUM(fsp.paid) FILTER (WHERE fsp.status = 'Partially Paid'), 0) AS paid_partial
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id WHERE bp.window_id = $1`, [win.id])).rows[0];

    const perBatch = (await db.query(
        `SELECT bp.display_name, bp.batch_start_year, bp.semester_number,
                COUNT(fsp.id)::int AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int AS yet,
                COUNT(*) FILTER (WHERE fsp.tag_case = 'Dropout')::int AS dropouts,
                COALESCE(SUM(fsp.payable), 0) AS payable,
                COALESCE(SUM(fsp.paid), 0) AS paid,
                COALESCE(SUM(fsp.pending), 0) AS pending
           FROM fee_batch_period bp LEFT JOIN fee_student_payments fsp ON fsp.batch_period_id = bp.id
          WHERE bp.window_id = $1 GROUP BY bp.id ORDER BY bp.batch_start_year DESC`, [win.id])).rows;

    const perUni = (await db.query(
        `SELECT u.name,
                COUNT(fsp.id)::int AS total,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int AS fully,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int AS partial,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int AS yet,
                COALESCE(SUM(fsp.payable), 0) AS payable,
                COALESCE(SUM(fsp.paid), 0) AS paid
           FROM fee_student_payments fsp JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           JOIN universities u ON u.id = fsp.university_id
          WHERE bp.window_id = $1 GROUP BY u.id ORDER BY payable DESC`, [win.id])).rows;

    const students = (await db.query(
        `SELECT bp.display_name AS batch_name, bp.semester_number, u.name AS university,
                fsp.zoho_user_id, fsp.student_name,
                fsp.payable, fsp.paid, fsp.pending,
                fsp.previous_fee_due, fsp.current_term_discount,
                fsp.status, fsp.registration_status, fsp.registration_date::text AS registration_date,
                fsp.tag_case, fsp.success_coach_name,
                COALESCE(rc.n, 0) AS remark_count
           FROM fee_student_payments fsp JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           LEFT JOIN universities u ON u.id = fsp.university_id
           LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM fee_remarks fr WHERE fr.student_payment_id = fsp.id) rc ON true
          WHERE bp.window_id = $1 ORDER BY bp.batch_start_year DESC, u.name, fsp.student_name`, [win.id])).rows;

    const dropouts = (await db.query(
        `SELECT fdl.zoho_user_id, fdl.student_name, u.name AS university,
                bp.display_name AS batch_name, bp.semester_number,
                fdl.dropped_at::text AS dropped_at, fdl.reason, fdl.imported_at::text AS imported_at
           FROM fee_dropout_log fdl LEFT JOIN universities u ON u.id = fdl.university_id
           LEFT JOIN fee_batch_period bp ON bp.id = fdl.batch_period_id
          WHERE fdl.window_id = $1 ORDER BY COALESCE(fdl.dropped_at, fdl.imported_at::date) DESC, fdl.student_name`, [win.id])).rows;

    // Analytics queries
    const dropoutReasons = (await db.query(
        `SELECT COALESCE(NULLIF(TRIM(reason), ''), '(no reason given)') AS reason,
                COUNT(*)::int AS n
           FROM fee_dropout_log
          WHERE window_id = $1
          GROUP BY 1 ORDER BY n DESC LIMIT 25`, [win.id])).rows;
    const tagCounts = (await db.query(
        `SELECT fsp.tag_case, COUNT(*)::int AS n
           FROM fee_student_payments fsp JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
          WHERE bp.window_id = $1 AND fsp.tag_case IS NOT NULL AND fsp.tag_case <> ''
          GROUP BY fsp.tag_case ORDER BY n DESC`, [win.id])).rows;
    const totalDropoutsRow = (await db.query(
        `SELECT COUNT(*)::int AS n FROM fee_dropout_log WHERE window_id = $1`, [win.id])).rows[0];
    const totalDropouts = Number(totalDropoutsRow?.n ?? 0);

    // ── Workbook ─────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'UniConnect · Program Operations';
    wb.created = new Date();
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' IST';

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 1: SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 32 }, { width: 20 }, { width: 6 }, { width: 32 }, { width: 22 }];

        // Title bar (rows 1–2)
        ws.mergeCells('A1:E1');
        ws.getCell('A1').value = 'FEE COLLECTION REPORT';
        ws.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
        ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(1).height = 38;

        ws.mergeCells('A2:E2');
        ws.getCell('A2').value = 'NIAT · Program Operations';
        ws.getCell('A2').font = { name: 'Calibri', size: 11, color: { argb: 'FFFDE2E6' } };
        ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON_DARK } };
        ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(2).height = 18;

        // Window meta (rows 4–6)
        ws.mergeCells('A4:E4');
        ws.getCell('A4').value = win.name;
        ws.getCell('A4').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111827' } };
        ws.mergeCells('A5:E5');
        ws.getCell('A5').value = `Generated: ${nowIst}`;
        ws.getCell('A5').font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };
        ws.mergeCells('A6:E6');
        ws.getCell('A6').value = win.last_synced_at ? `Sheet last synced: ${new Date(win.last_synced_at).toISOString().replace('T', ' ').slice(0, 16)} UTC · Sheet ID ${win.sheet_id}` : `Sheet ID ${win.sheet_id}`;
        ws.getCell('A6').font = { name: 'Calibri', size: 10, color: { argb: 'FF6B7280' } };

        // Section: PAYMENT BREAKDOWN
        const sec1 = ws.getRow(8);
        ws.mergeCells('A8:E8');
        sec1.getCell(1).value = 'PAYMENT BREAKDOWN';
        sec1.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + MAROON_DARK } };
        sec1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON_TINT } };
        sec1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sec1.height = 22;

        // Pairs: left label + value, gap, right label + value
        const pairs: Array<[string, number | string, string, number | string, 'count' | 'rupee' | 'pct']> = [
            ['Students',       Number(totals.total),    'Total payable',  Number(totals.payable),     'rupee'],
            ['Fully paid',     Number(totals.fully),    'Total collected', Number(totals.paid),       'rupee'],
            ['Partially paid', Number(totals.partial),  'Pending',        Number(totals.pending),     'rupee'],
            ['Yet to pay',     Number(totals.yet),      'Collection %',   Number(totals.payable) > 0 ? Number(totals.paid) / Number(totals.payable) : 0, 'pct'],
            ['Dropouts',       totalDropouts,           '',               '',                          'count'],
        ];
        pairs.forEach((p, i) => {
            const r = ws.getRow(9 + i);
            r.getCell(1).value = p[0];
            r.getCell(1).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
            r.getCell(2).value = p[1];
            r.getCell(2).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111827' } };
            r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
            r.getCell(4).value = p[2];
            r.getCell(4).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
            if (p[2]) {
                r.getCell(5).value = p[3];
                r.getCell(5).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF' + (p[4] === 'rupee' || p[4] === 'pct' ? EMERALD_TX : '111827') } };
                r.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
                if (p[4] === 'rupee') r.getCell(5).numFmt = RUPEE_FMT;
                if (p[4] === 'pct')   r.getCell(5).numFmt = PCT_FMT;
            }
            r.height = 22;
        });

        // Section: SOURCE OF COLLECTION
        const sec2Row = 9 + pairs.length + 1;
        ws.mergeCells(`A${sec2Row}:E${sec2Row}`);
        ws.getCell(`A${sec2Row}`).value = 'SOURCE OF COLLECTION';
        ws.getCell(`A${sec2Row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + MAROON_DARK } };
        ws.getCell(`A${sec2Row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON_TINT } };
        ws.getCell(`A${sec2Row}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(sec2Row).height = 22;

        const srcRows: Array<[string, number, string, string]> = [
            ['From fully-paid students', Number(totals.paid_fully),   `${Number(totals.fully)} students`,   EMERALD_TX],
            ['From partial payments',    Number(totals.paid_partial), `${Number(totals.partial)} students`, AMBER_TX],
        ];
        srcRows.forEach((sr, i) => {
            const r = ws.getRow(sec2Row + 1 + i);
            r.getCell(1).value = sr[0]; r.getCell(1).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
            r.getCell(2).value = sr[1]; r.getCell(2).numFmt = RUPEE_FMT;
            r.getCell(2).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF' + sr[3] } };
            r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
            r.getCell(3).value = sr[2]; r.getCell(3).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF9CA3AF' } };
            r.height = 22;
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 2: PER BATCH
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Per Batch', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
        ws.columns = [
            { header: 'Batch', key: 'name',  width: 30 },
            { header: 'Year',  key: 'year',  width: 8  },
            { header: 'Sem',   key: 'sem',   width: 6  },
            { header: 'Total', key: 't',     width: 8  },
            { header: 'Fully', key: 'f',     width: 8  },
            { header: 'Partial', key: 'p',   width: 10 },
            { header: 'Yet',   key: 'y',     width: 8  },
            { header: 'Dropouts', key: 'd',  width: 11 },
            { header: 'Payable', key: 'pay', width: 18 },
            { header: 'Paid',  key: 'paid',  width: 18 },
            { header: 'Pending', key: 'pen', width: 18 },
            { header: 'Coll %', key: 'pct',  width: 10 },
        ];
        setHeaderStyle(ws.getRow(1));

        let tT=0,tF=0,tP=0,tY=0,tD=0,tPay=0,tPaid=0,tPend=0;
        perBatch.forEach((b, i) => {
            const pay=Number(b.payable), paid=Number(b.paid);
            tT+=Number(b.total); tF+=Number(b.fully); tP+=Number(b.partial); tY+=Number(b.yet); tD+=Number(b.dropouts);
            tPay+=pay; tPaid+=paid; tPend+=Number(b.pending);
            const pct = pay > 0 ? paid / pay : 0;
            const row = ws.addRow({
                name: b.display_name, year: Number(b.batch_start_year), sem: Number(b.semester_number),
                t: Number(b.total), f: Number(b.fully), p: Number(b.partial), y: Number(b.yet), d: Number(b.dropouts),
                pay, paid, pen: Number(b.pending), pct,
            });
            setStripeStyle(row, i % 2 === 1);
            row.getCell('pay').numFmt = RUPEE_FMT;
            row.getCell('paid').numFmt = RUPEE_FMT;
            row.getCell('pen').numFmt = RUPEE_FMT;
            row.getCell('pct').numFmt = PCT_FMT;
            row.getCell('f').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + EMERALD_TX }, bold: true };
            row.getCell('p').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + AMBER_TX },   bold: true };
            row.getCell('y').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + RED_TX },     bold: true };
            pctTextColor(row.getCell('pct'), pct * 100);
            row.getCell('pct').alignment = { vertical: 'middle', horizontal: 'right' };
        });
        const totRow = ws.addRow({
            name: 'TOTAL', year: '', sem: '',
            t: tT, f: tF, p: tP, y: tY, d: tD,
            pay: tPay, paid: tPaid, pen: tPend,
            pct: tPay > 0 ? tPaid / tPay : 0,
        });
        setTotalsRowStyle(totRow);
        totRow.getCell('pay').numFmt = RUPEE_FMT;
        totRow.getCell('paid').numFmt = RUPEE_FMT;
        totRow.getCell('pen').numFmt = RUPEE_FMT;
        totRow.getCell('pct').numFmt = PCT_FMT;
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 3: PER UNIVERSITY
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Per University', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
        ws.columns = [
            { header: 'University', key: 'name', width: 40 },
            { header: 'Total',   key: 't',    width: 8  },
            { header: 'Fully',   key: 'f',    width: 8  },
            { header: 'Partial', key: 'p',    width: 10 },
            { header: 'Yet',     key: 'y',    width: 8  },
            { header: 'Payable', key: 'pay',  width: 18 },
            { header: 'Paid',    key: 'paid', width: 18 },
            { header: 'Coll %',  key: 'pct',  width: 10 },
        ];
        setHeaderStyle(ws.getRow(1));

        let uT=0,uF=0,uP=0,uY=0,uPay=0,uPaid=0;
        perUni.forEach((u, i) => {
            const pay=Number(u.payable), paid=Number(u.paid);
            uT+=Number(u.total); uF+=Number(u.fully); uP+=Number(u.partial); uY+=Number(u.yet); uPay+=pay; uPaid+=paid;
            const pct = pay > 0 ? paid / pay : 0;
            const row = ws.addRow({ name: u.name, t: Number(u.total), f: Number(u.fully), p: Number(u.partial), y: Number(u.yet), pay, paid, pct });
            setStripeStyle(row, i % 2 === 1);
            row.getCell('pay').numFmt = RUPEE_FMT;
            row.getCell('paid').numFmt = RUPEE_FMT;
            row.getCell('pct').numFmt = PCT_FMT;
            row.getCell('f').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + EMERALD_TX }, bold: true };
            row.getCell('p').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + AMBER_TX },   bold: true };
            row.getCell('y').font = { name: 'Calibri', size: 11, color: { argb: 'FF' + RED_TX },     bold: true };
            pctTextColor(row.getCell('pct'), pct * 100);
            row.getCell('pct').alignment = { vertical: 'middle', horizontal: 'right' };
        });
        const totRow = ws.addRow({ name: 'TOTAL', t: uT, f: uF, p: uP, y: uY, pay: uPay, paid: uPaid, pct: uPay > 0 ? uPaid / uPay : 0 });
        setTotalsRowStyle(totRow);
        totRow.getCell('pay').numFmt = RUPEE_FMT;
        totRow.getCell('paid').numFmt = RUPEE_FMT;
        totRow.getCell('pct').numFmt = PCT_FMT;
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 4: ANALYTICS — reordered, with embedded PNG charts.
    //
    // Section order (per user spec):
    //   1) Collection KPIs (the most important numbers)
    //   2) Payment status doughnut chart
    //   3) Batch comparison + Collection % chart
    //   4) Top universities by collection (table + chart)
    //   5) Needs attention — bottom 5
    //   6) Operator tag distribution (excludes 'Dropout' — the headline
    //      already shows real dropouts from the dropout sub-sheet, so
    //      including the operator-applied 'Dropout' tag double-counted
    //      and confused operators)
    //   7) Top dropout reasons (capped at top 10 + "Other") + chart
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Analytics', { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 36 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 36 }, { width: 14 }];

        let row = 1;
        const banner = (text: string, fg = 'FFFFFF', bg = MAROON, size = 14) => {
            ws.mergeCells(`A${row}:F${row}`);
            const cell = ws.getCell(`A${row}`);
            cell.value = text;
            cell.font = { name: 'Calibri', size, bold: true, color: { argb: 'FF' + fg } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            ws.getRow(row).height = size === 14 ? 22 : 32;
            row++;
        };

        // Title block
        banner('COLLECTION ANALYTICS', 'FFFFFF', MAROON, 16);
        ws.mergeCells(`A${row}:F${row}`);
        ws.getCell(`A${row}`).value = `${win.name}  ·  Generated ${nowIst}`;
        ws.getCell(`A${row}`).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
        ws.getRow(row).height = 18;
        row += 2;

        // ── Section 1: Collection KPIs ──────────────────────────────
        banner('COLLECTION SNAPSHOT', MAROON_DARK, MAROON_TINT);
        const kpis: Array<[string, number | string, string, number | string, 'count' | 'rupee' | 'pct' | 'text']> = [
            ['Students', Number(totals.total), 'Total payable', Number(totals.payable), 'rupee'],
            ['Fully paid', Number(totals.fully), 'Total collected', Number(totals.paid), 'rupee'],
            ['Partially paid', Number(totals.partial), 'Pending', Number(totals.pending), 'rupee'],
            ['Yet to pay', Number(totals.yet), 'Collection %', Number(totals.payable) > 0 ? Number(totals.paid) / Number(totals.payable) : 0, 'pct'],
            ['Dropouts', totalDropouts, 'From fully paid', Number(totals.paid_fully), 'rupee'],
            ['', '', 'From partial', Number(totals.paid_partial), 'rupee'],
        ];
        kpis.forEach(([leftLabel, leftVal, rightLabel, rightVal, rightKind]) => {
            const r = ws.getRow(row);
            r.getCell(1).value = leftLabel;
            r.getCell(1).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
            if (leftVal !== '') {
                r.getCell(2).value = leftVal as number;
                r.getCell(2).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111827' } };
                r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
            }
            r.getCell(4).value = rightLabel;
            r.getCell(4).font = { name: 'Calibri', size: 11, color: { argb: 'FF6B7280' } };
            if (rightLabel) {
                r.getCell(5).value = rightVal as number;
                r.getCell(5).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF' + (rightKind === 'rupee' || rightKind === 'pct' ? EMERALD_TX : '111827') } };
                r.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
                if (rightKind === 'rupee') r.getCell(5).numFmt = RUPEE_FMT;
                if (rightKind === 'pct')   r.getCell(5).numFmt = PCT_FMT;
            }
            r.height = 22;
            row++;
        });
        row++;

        // ── Section 2: Payment status doughnut ──────────────────────
        banner('PAYMENT STATUS', MAROON_DARK, MAROON_TINT);
        {
            const img = renderStatusDoughnut(Number(totals.fully), Number(totals.partial), Number(totals.yet));
            const id = wb.addImage({ buffer: img.buffer, extension: 'png' });
            ws.addImage(id, {
                tl: { col: 0, row: row - 1 },
                ext: { width: img.width, height: img.height },
            });
            // Reserve vertical space so the next section doesn't overlap
            for (let i = 0; i < 19; i++) ws.getRow(row + i).height = 18;
            row += 20;
        }

        // ── Section 3: Batch comparison (table + chart) ─────────────
        banner('BATCH COMPARISON', MAROON_DARK, MAROON_TINT);
        ['Batch', 'Students', 'Payable', '', 'Paid', 'Coll %'].forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
        });
        row++;
        const batchChartData: Array<{ label: string; pct: number; paid: number; payable: number }> = [];
        perBatch.forEach((b, i) => {
            const pay = Number(b.payable), paid = Number(b.paid);
            const pct = pay > 0 ? paid / pay : 0;
            ws.getCell(row, 1).value = b.display_name;
            ws.getCell(row, 2).value = Number(b.total);
            ws.getCell(row, 3).value = pay;  ws.getCell(row, 3).numFmt = RUPEE_FMT;
            ws.getCell(row, 5).value = paid; ws.getCell(row, 5).numFmt = RUPEE_FMT;
            ws.getCell(row, 6).value = pct;  ws.getCell(row, 6).numFmt = PCT_FMT;
            pctTextColor(ws.getCell(row, 6), pct * 100);
            ws.getCell(row, 6).alignment = { vertical: 'middle', horizontal: 'right' };
            if (i % 2 === 1) {
                for (let col = 1; col <= 6; col++) {
                    if (col === 4) continue;
                    ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
                }
            }
            batchChartData.push({ label: String(b.display_name), pct: pct * 100, paid, payable: pay });
            row++;
        });
        row++;
        {
            const img = renderBatchCollectionChart(batchChartData);
            const id = wb.addImage({ buffer: img.buffer, extension: 'png' });
            ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: img.width, height: img.height } });
            for (let i = 0; i < 19; i++) ws.getRow(row + i).height = 18;
            row += 20;
        }

        // ── Section 4: University leaderboard (table + chart) ───────
        banner('UNIVERSITY LEADERBOARD — TOP 5 BY COLLECTION % (min 50 students)', MAROON_DARK, MAROON_TINT);
        ['University', 'Students', 'Payable', '', 'Paid', 'Coll %'].forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
        });
        row++;
        const qualifiers = perUni.filter(u => Number(u.total) >= 50).map(u => ({
            name: u.name as string, total: Number(u.total), payable: Number(u.payable), paid: Number(u.paid),
            pct: Number(u.payable) > 0 ? Number(u.paid) / Number(u.payable) : 0,
        }));
        const top5 = [...qualifiers].sort((a, b) => b.pct - a.pct).slice(0, 5);
        top5.forEach((u, i) => {
            ws.getCell(row, 1).value = u.name;
            ws.getCell(row, 2).value = u.total;
            ws.getCell(row, 3).value = u.payable; ws.getCell(row, 3).numFmt = RUPEE_FMT;
            ws.getCell(row, 5).value = u.paid;    ws.getCell(row, 5).numFmt = RUPEE_FMT;
            ws.getCell(row, 6).value = u.pct;     ws.getCell(row, 6).numFmt = PCT_FMT;
            pctTextColor(ws.getCell(row, 6), u.pct * 100);
            ws.getCell(row, 6).alignment = { vertical: 'middle', horizontal: 'right' };
            if (i % 2 === 1) {
                for (let col = 1; col <= 6; col++) {
                    if (col === 4) continue;
                    ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
                }
            }
            row++;
        });
        row++;
        {
            // Use ALL universities for the chart, sorted by payable DESC, top 10
            const chartItems = perUni.slice(0, 10).map(u => ({
                name: String(u.name),
                payable: Number(u.payable),
                paid: Number(u.paid),
                pct: Number(u.payable) > 0 ? Number(u.paid) / Number(u.payable) : 0,
            }));
            const img = renderTopUniversitiesChart(chartItems);
            const id = wb.addImage({ buffer: img.buffer, extension: 'png' });
            ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: img.width, height: img.height } });
            const chartRows = Math.ceil(img.height / 20);
            for (let i = 0; i < chartRows; i++) ws.getRow(row + i).height = 18;
            row += chartRows + 1;
        }

        // ── Section 5: Needs attention (bottom 5) ───────────────────
        banner('NEEDS ATTENTION — BOTTOM 5 BY COLLECTION % (min 50 students)', RED_TX, RED_BG);
        ['University', 'Students', 'Payable', '', 'Paid', 'Coll %'].forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
        });
        row++;
        const bottom5 = [...qualifiers].sort((a, b) => a.pct - b.pct).slice(0, 5);
        bottom5.forEach((u, i) => {
            ws.getCell(row, 1).value = u.name;
            ws.getCell(row, 2).value = u.total;
            ws.getCell(row, 3).value = u.payable; ws.getCell(row, 3).numFmt = RUPEE_FMT;
            ws.getCell(row, 5).value = u.paid;    ws.getCell(row, 5).numFmt = RUPEE_FMT;
            ws.getCell(row, 6).value = u.pct;     ws.getCell(row, 6).numFmt = PCT_FMT;
            pctTextColor(ws.getCell(row, 6), u.pct * 100);
            ws.getCell(row, 6).alignment = { vertical: 'middle', horizontal: 'right' };
            if (i % 2 === 1) {
                for (let col = 1; col <= 6; col++) {
                    if (col === 4) continue;
                    ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
                }
            }
            row++;
        });
        row++;

        // ── Section 6: Operator tag distribution ────────────────────
        // Exclude 'Dropout' from this chart/table — the actual dropout count
        // is already in the headline (totalDropouts from the sub-sheet) and
        // including the operator-applied 'Dropout' tag here only causes
        // confusion (it'll always be ≤ totalDropouts and looks wrong).
        const operatorTags = tagCounts.filter((t: { tag_case: string; n: number }) => t.tag_case !== 'Dropout');
        banner('OPERATOR-SET TAG DISTRIBUTION (excludes Dropout — see headline)', MAROON_DARK, MAROON_TINT);
        ['Tag case', 'Count'].forEach((h, i) => {
            const cell = ws.getCell(row, i === 0 ? 1 : 2);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
        });
        row++;
        if (operatorTags.length === 0) {
            ws.getCell(row, 1).value = '(no operator tags applied yet)';
            ws.getCell(row, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF9CA3AF' } };
            row++;
        } else {
            operatorTags.forEach((t: { tag_case: string; n: number }, i: number) => {
                ws.getCell(row, 1).value = t.tag_case;
                ws.getCell(row, 2).value = Number(t.n);
                ws.getCell(row, 2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1D4ED8' } };
                ws.getCell(row, 2).alignment = { vertical: 'middle', horizontal: 'right' };
                if (i % 2 === 1) {
                    for (let col = 1; col <= 2; col++) {
                        ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
                    }
                }
                row++;
            });
        }
        row++;
        if (operatorTags.length > 0) {
            const img = renderTagCaseChart(operatorTags.map((t: { tag_case: string; n: number }) => ({ tag: t.tag_case, n: Number(t.n) })));
            const id = wb.addImage({ buffer: img.buffer, extension: 'png' });
            ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: img.width, height: img.height } });
            for (let i = 0; i < 19; i++) ws.getRow(row + i).height = 18;
            row += 20;
        }

        // ── Section 7: Top dropout reasons (capped + chart) ─────────
        banner('TOP DROPOUT REASONS', MAROON_DARK, MAROON_TINT);
        // Cap to top 10, fold the rest into "Other"
        const topReasons = dropoutReasons.slice(0, 10).map((r: { reason: string; n: number }) => ({ reason: String(r.reason), n: Number(r.n) }));
        const otherN = dropoutReasons.slice(10).reduce((acc: number, r: { n: number }) => acc + Number(r.n), 0);
        const reasonsForTable = otherN > 0 ? [...topReasons, { reason: `Other (${dropoutReasons.length - 10} more reasons)`, n: otherN }] : topReasons;

        ['Reason', 'Count', '% of total'].forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
        });
        row++;
        reasonsForTable.forEach((r, i) => {
            ws.getCell(row, 1).value = r.reason;
            ws.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            ws.getCell(row, 2).value = r.n;
            ws.getCell(row, 2).alignment = { vertical: 'middle', horizontal: 'right' };
            ws.getCell(row, 3).value = totalDropouts > 0 ? r.n / totalDropouts : 0;
            ws.getCell(row, 3).numFmt = PCT_FMT;
            ws.getCell(row, 3).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + MAROON_DARK } };
            ws.getCell(row, 3).alignment = { vertical: 'middle', horizontal: 'right' };
            if (i % 2 === 1) {
                for (let col = 1; col <= 3; col++) {
                    ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRAY_STRIPE } };
                }
            }
            row++;
        });
        row++;
        if (topReasons.length > 0) {
            const img = renderDropoutReasonsChart(topReasons, totalDropouts);
            const id = wb.addImage({ buffer: img.buffer, extension: 'png' });
            ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: img.width, height: img.height } });
            const chartRows = Math.ceil(img.height / 20);
            for (let i = 0; i < chartRows; i++) ws.getRow(row + i).height = 18;
            row += chartRows + 1;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 5: STUDENTS
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1, xSplit: 5, showGridLines: false }] });
        ws.columns = [
            { header: 'Batch',         key: 'batch',  width: 28 },
            { header: 'Sem',           key: 'sem',    width: 6  },
            { header: 'University',    key: 'uni',    width: 28 },
            { header: 'User ID',       key: 'uid',    width: 36 },
            { header: 'Student Name',  key: 'name',   width: 28 },
            { header: 'Payable',       key: 'pay',    width: 14 },
            { header: 'Paid',          key: 'paid',   width: 14 },
            { header: 'Pending',       key: 'pen',    width: 14 },
            { header: 'Prev Due',      key: 'prev',   width: 12 },
            { header: 'Discount',      key: 'disc',   width: 12 },
            { header: 'Status',        key: 'status', width: 16 },
            { header: 'Reg Status',    key: 'regs',   width: 20 },
            { header: 'Reg Date',      key: 'regd',   width: 12 },
            { header: 'Tag Case',      key: 'tag',    width: 22 },
            { header: 'Success Coach', key: 'coach',  width: 22 },
            { header: 'Remarks',       key: 'rem',    width: 10 },
        ];
        setHeaderStyle(ws.getRow(1));

        students.forEach((s, i) => {
            const row = ws.addRow({
                batch: s.batch_name, sem: Number(s.semester_number), uni: s.university,
                uid: s.zoho_user_id, name: s.student_name,
                pay: Number(s.payable), paid: Number(s.paid), pen: Number(s.pending),
                prev: Number(s.previous_fee_due ?? 0), disc: Number(s.current_term_discount ?? 0),
                status: s.status, regs: s.registration_status, regd: s.registration_date,
                tag: s.tag_case, coach: s.success_coach_name, rem: Number(s.remark_count),
            });
            setStripeStyle(row, i % 2 === 1);
            ['pay','paid','pen','prev','disc'].forEach(k => { row.getCell(k).numFmt = RUPEE_FMT; });
            statusPill(row.getCell('status'), s.status);
            if (Number(s.remark_count) > 0) row.getCell('rem').font = { name: 'Calibri', size: 11, color: { argb: 'FF1D4ED8' }, bold: true };
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };
    }

    // ═══════════════════════════════════════════════════════════════════
    // SHEET 6: DROPOUTS
    // ═══════════════════════════════════════════════════════════════════
    {
        const ws = wb.addWorksheet('Dropouts', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
        ws.columns = [
            { header: 'User ID',    key: 'uid',    width: 36 },
            { header: 'Student',    key: 'name',   width: 28 },
            { header: 'University', key: 'uni',    width: 28 },
            { header: 'Batch',      key: 'batch',  width: 26 },
            { header: 'Sem',        key: 'sem',    width: 6  },
            { header: 'Dropped',    key: 'date',   width: 14 },
            { header: 'Reason',     key: 'reason', width: 50 },
        ];
        setHeaderStyle(ws.getRow(1));

        dropouts.forEach((d, i) => {
            const dropped = d.dropped_at || (d.imported_at ? d.imported_at.slice(0, 10) : '');
            const row = ws.addRow({
                uid: d.zoho_user_id, name: d.student_name, uni: d.university,
                batch: d.batch_name, sem: d.semester_number ? Number(d.semester_number) : '',
                date: dropped, reason: d.reason,
            });
            setStripeStyle(row, i % 2 === 1);
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
    }

    const buf = await wb.xlsx.writeBuffer();
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
