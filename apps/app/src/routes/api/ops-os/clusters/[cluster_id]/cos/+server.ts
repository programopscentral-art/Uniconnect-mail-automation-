/**
 * PATCH /api/ops-os/clusters/:cluster_id/cos
 *   Body: { user_id: string | null }
 *
 * ADMIN / PROGRAM_OPS only. Sets (or clears) the COS owner for a cluster.
 * Setting to null leaves the cluster without a designated COS, which means
 * COS-scope queries will not include them — useful when transitioning.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    checkOpsOsAccess(locals, 'admin');
    if (!params.cluster_id) throw error(400, 'cluster_id required');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw error(400, 'request body required');
    const raw = (body as Record<string, unknown>).user_id;
    const user_id: string | null = raw === null || raw === undefined || raw === ''
        ? null
        : String(raw).trim();

    const client = await db.connect();
    try {
        if (user_id) {
            // Sanity-check the user exists and is active
            const u = await client.query(
                `SELECT 1 FROM public.users WHERE id = $1 AND (is_active IS NULL OR is_active = true)`,
                [user_id],
            );
            if (u.rowCount === 0) throw error(400, 'user_id does not refer to an active user');
        }

        // cos_user_id has NOT NULL on cluster_dim; do NOT set to NULL.
        // If the caller asks to clear, refuse — admins should reassign first.
        if (!user_id) {
            throw error(400, 'cos_user_id cannot be cleared; assign a different user to take over instead');
        }

        const r = await client.query(
            `UPDATE ops_os.cluster_dim
                SET cos_user_id = $2
              WHERE cluster_id = $1
              RETURNING cluster_id`,
            [params.cluster_id, user_id],
        );
        if (r.rowCount === 0) throw error(404, 'cluster not found');
        return json({ ok: true });
    } finally {
        client.release();
    }
};
