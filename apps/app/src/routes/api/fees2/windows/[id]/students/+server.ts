/**
 * GET /api/fees2/windows/:id/students?university_id=&batches=&status=&tag=&search=
 *   → student-payment rows across a whole semester window, filterable by
 *     university and by a comma-separated list of batch_period_ids. Powers the
 *     first-class Student-wise tab (which is scoped to the Overview's batch
 *     multi-select rather than to a single batch).
 *
 * `batches` is an optional CSV of batch_period_ids; when omitted, every batch
 * in the window is included.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals, url }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const universityId = url.searchParams.get('university_id') || '';
    const status = url.searchParams.get('status') || '';
    const tag = url.searchParams.get('tag') || '';
    const search = (url.searchParams.get('search') || '').trim();
    const batchesCsv = (url.searchParams.get('batches') || '').trim();
    const batchIds = batchesCsv ? batchesCsv.split(',').map(s => s.trim()).filter(Boolean) : [];

    const conds = ['bp.window_id = $1'];
    const args: unknown[] = [params.id];
    if (batchIds.length > 0) { args.push(batchIds); conds.push(`fsp.batch_period_id = ANY($${args.length}::uuid[])`); }
    if (universityId) { args.push(universityId); conds.push(`fsp.university_id = $${args.length}`); }
    if (status) { args.push(status); conds.push(`fsp.status = $${args.length}`); }
    if (tag) { args.push(tag); conds.push(`fsp.tag_case = $${args.length}`); }
    if (search) {
        args.push(`%${search}%`);
        conds.push(`(fsp.student_name ILIKE $${args.length} OR fsp.zoho_user_id ILIKE $${args.length})`);
    }

    const r = await db.query(
        `SELECT fsp.id, fsp.batch_period_id, fsp.university_id, fsp.zoho_user_id,
                fsp.student_name, fsp.payable, fsp.paid, fsp.pending,
                fsp.previous_fee_due, fsp.current_term_discount,
                fsp.status, fsp.registration_status, fsp.registration_date,
                fsp.tag_case, fsp.success_coach_name, fsp.updated_at,
                u.name AS university_name,
                bp.display_name AS batch_name, bp.batch_start_year,
                COALESCE(rc.n, 0) AS remark_count,
                rc.last_at::text AS last_remark_at
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           LEFT JOIN universities u ON u.id = fsp.university_id
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at
               FROM fee_remarks fr
              WHERE fr.student_payment_id = fsp.id
           ) rc ON true
          WHERE ${conds.join(' AND ')}
          ORDER BY u.name, fsp.student_name
          LIMIT 20000`,
        args,
    );
    return json({ students: r.rows });
};
