/**
 * GET /api/fees2/windows/[id]/report.csv
 *
 * Returns a CSV of every student-payment row in the window, joined with
 * batch + university + remark count. Used both by the in-app "Download
 * report" button and as a link inside the snapshot email so recipients
 * can open the full picture in Excel without logging in.
 *
 * Single-pass query; safe for the current data scale (~5k rows). If we
 * ever go past ~50k rows per window we should stream.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // Quote any cell that needs it; escape inner quotes.
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function csvRow(cells: unknown[]): string { return cells.map(csvCell).join(',') + '\r\n'; }

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const wRes = await db.query(`SELECT id, name FROM fee_semester_window WHERE id = $1`, [params.id]);
    if (wRes.rows.length === 0) throw error(404, 'window not found');
    const w = wRes.rows[0] as { id: string; name: string };

    const r = await db.query(
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
        [params.id],
    );

    const header = [
        'Batch Year', 'Semester', 'Batch', 'University',
        'User ID', 'Student Name',
        'Payable', 'Paid', 'Pending', 'Previous Fee Due', 'Current Term Discount',
        'Status', 'Registration Status', 'Registration Date',
        'Tag Case', 'Success Coach', 'Remark Count',
    ];
    const chunks: string[] = [csvRow(header)];
    for (const row of r.rows) {
        chunks.push(csvRow([
            row.batch_start_year, row.semester_number, row.batch_name, row.university,
            row.zoho_user_id, row.student_name,
            row.payable, row.paid, row.pending, row.previous_fee_due, row.current_term_discount,
            row.status, row.registration_status, row.registration_date,
            row.tag_case, row.success_coach_name, row.remark_count,
        ]));
    }

    // BOM so Excel opens UTF-8 correctly (rupee symbol etc.)
    const body = '﻿' + chunks.join('');
    const safeName = w.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    return new Response(body, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="fee_collection_${safeName}_${today}.csv"`,
            'Cache-Control': 'no-store',
        },
    });
};
