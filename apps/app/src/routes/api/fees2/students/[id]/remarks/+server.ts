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
        `SELECT r.id, r.author_id, r.author_name, r.role, r.designation, r.case_type,
                r.text, r.source, r.created_at,
                COALESCE(
                    json_agg(
                        json_build_object('id', a.id, 'file_name', a.file_name,
                                          'file_url', a.file_url, 'mime_type', a.mime_type,
                                          'size_bytes', a.size_bytes)
                        ORDER BY a.uploaded_at
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) AS attachments
           FROM fee_remarks r
           LEFT JOIN fee_remark_attachments a ON a.remark_id = r.id
          WHERE r.student_payment_id = $1
          GROUP BY r.id
          ORDER BY r.created_at DESC
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
    // Designation defaults to the author's role when the caller doesn't supply one.
    const designation = (body.designation ? String(body.designation).trim() : '') || user.role || null;

    const r = await db.query(
        `INSERT INTO fee_remarks
            (student_payment_id, author_id, author_name, role, designation, case_type, text, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')
         RETURNING id, author_id, author_name, role, designation, case_type, text, source, created_at,
                   '[]'::json AS attachments`,
        [params.id, user.id, user.name || user.email, user.role, designation, case_type, text],
    );
    return json({ remark: r.rows[0] });
};
