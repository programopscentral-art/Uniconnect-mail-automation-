/**
 * PATCH /api/fees2/students/:id/tag-case  body { tag_case: string | null }
 *   Sets the tag_case on a fee_student_payments row.
 *   Allowed roles: PM / PMA / COS / BOA / CMA / admin (via checkFeeAccess 'edit_remarks').
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import { TAG_CASES } from '$lib/server/fee_sync_v2';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    checkFeeAccess(locals, 'edit_remarks');
    if (!params.id) throw error(400, 'id required');
    const body = await request.json().catch(() => ({}));
    const raw = body.tag_case;
    const tag = raw === null || raw === '' ? null : String(raw).trim();

    // Soft validate — UI sends canonical values, but allow null to clear
    if (tag !== null && !(TAG_CASES as readonly string[]).includes(tag)) {
        throw error(400, `Unknown tag_case "${tag}". Must be one of: ${TAG_CASES.join(', ')}`);
    }

    const r = await db.query(
        `UPDATE fee_student_payments
            SET tag_case = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, tag_case`,
        [params.id, tag],
    );
    if (r.rowCount === 0) throw error(404, 'Student row not found');
    return json({ ok: true, ...r.rows[0] });
};
