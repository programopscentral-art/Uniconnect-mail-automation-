/**
 * POST /api/ops-os/assignments
 *   Body: { user_id, campus_id, role: 'BOA' | 'PM' }
 *
 * DELETE /api/ops-os/assignments
 *   Body: { user_id, campus_id, role: 'BOA' | 'PM' }
 *
 * ADMIN / PROGRAM_OPS only. Adds or revokes a campus assignment so the
 * corresponding ops_os pages become accessible (or stop being accessible)
 * for that user.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

const VALID_ROLES = ['BOA', 'PM'] as const;
type AssignmentRole = typeof VALID_ROLES[number];

function parseBody(b: unknown): { user_id: string; campus_id: string; role: AssignmentRole } {
    if (!b || typeof b !== 'object') throw error(400, 'request body required');
    const o = b as Record<string, unknown>;
    const user_id = String(o.user_id ?? '').trim();
    const campus_id = String(o.campus_id ?? '').trim();
    const role = String(o.role ?? '').trim();
    if (!user_id || !campus_id) throw error(400, 'user_id and campus_id required');
    if (!VALID_ROLES.includes(role as AssignmentRole)) {
        throw error(400, `role must be one of: ${VALID_ROLES.join(', ')}`);
    }
    return { user_id, campus_id, role: role as AssignmentRole };
}

export const POST: RequestHandler = async ({ request, locals }) => {
    checkOpsOsAccess(locals, 'admin');
    const body = parseBody(await request.json().catch(() => null));

    const client = await db.connect();
    try {
        // If a soft-revoked row exists, un-revoke it. Otherwise insert.
        await client.query(
            `INSERT INTO ops_os.user_campus_assignment (user_id, campus_id, role, assigned_at, revoked_at)
             VALUES ($1, $2, $3, now(), NULL)
             ON CONFLICT (user_id, campus_id, role) DO UPDATE
               SET revoked_at = NULL, assigned_at = now()`,
            [body.user_id, body.campus_id, body.role],
        );
        return json({ ok: true });
    } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('foreign key') || msg.includes('violates')) {
            throw error(400, `Invalid user_id or campus_id: ${msg}`);
        }
        throw error(500, msg);
    } finally {
        client.release();
    }
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
    checkOpsOsAccess(locals, 'admin');
    const body = parseBody(await request.json().catch(() => null));

    const client = await db.connect();
    try {
        // Soft-revoke so the row + counter history is preserved
        await client.query(
            `UPDATE ops_os.user_campus_assignment
                SET revoked_at = now()
              WHERE user_id = $1 AND campus_id = $2 AND role = $3
                AND revoked_at IS NULL`,
            [body.user_id, body.campus_id, body.role],
        );
        return json({ ok: true });
    } finally {
        client.release();
    }
};
