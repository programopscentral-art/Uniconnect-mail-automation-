/**
 * GET /api/fees2/batches/:id/students?university_id=&status=&tag=&search=
 *   → student-payment rows for a batch_period with optional filters
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

    const conds = ['fsp.batch_period_id = $1'];
    const args: unknown[] = [params.id];
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
                u.name AS university_name
           FROM fee_student_payments fsp
           LEFT JOIN universities u ON u.id = fsp.university_id
          WHERE ${conds.join(' AND ')}
          ORDER BY u.name, fsp.student_name
          LIMIT 5000`,
        args,
    );
    return json({ students: r.rows });
};
