/**
 * GET  /api/fees2/students/:id/remarks
 *   → all remarks on this student-payment row (newest first)
 *
 * POST /api/fees2/students/:id/remarks  body { text, case_type? }
 *   → append a remark. Allowed roles: PM/PMA/COS/BOA/CMA/admin.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const r = await db.query(
        `SELECT id, author_id, author_name, role, case_type, text, source, created_at
           FROM fee_remarks
          WHERE student_payment_id = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [params.id],
    );
    return json({ remarks: r.rows });
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    checkFeeAccess(locals, 'edit_remarks');
    if (!params.id) throw error(400, 'id required');
    const body = await request.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (!text) throw error(400, 'text required');
    const case_type = body.case_type ? String(body.case_type).trim() : null;

    const user = locals.user!;
    const r = await db.query(
        `INSERT INTO fee_remarks
            (student_payment_id, author_id, author_name, role, case_type, text, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual')
         RETURNING id, author_id, author_name, role, case_type, text, source, created_at`,
        [params.id, user.id, user.name || user.email, user.role, case_type, text],
    );
    return json({ remark: r.rows[0] });
};
