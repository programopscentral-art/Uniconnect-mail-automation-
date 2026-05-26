/**
 * Operations OS — auto campus assignment.
 *
 * Bridges public.user_universities (which says "this BOA belongs to UNI X")
 * with ops_os.user_campus_assignment (which gates page access + RLS scope
 * to specific campuses). Without a row in user_campus_assignment a BOA
 * sees an empty campus dropdown on /ops-os/report and can't submit
 * anything, even though their role is BOA.
 *
 * For every active user with role='BOA', this function ensures one
 * user_campus_assignment row per active campus_dim row whose university_id
 * is in that user's universities list. Idempotent via INSERT ... ON
 * CONFLICT DO NOTHING and the (user_id, campus_id, role) primary key.
 *
 * If a previous row was soft-revoked (revoked_at IS NOT NULL), it is NOT
 * resurrected automatically — admins must explicitly re-grant via the
 * Access Rights UI, so revocations stick.
 *
 * Safe to run at every boot. Negligible cost since the INSERT skips rows
 * that already exist.
 */

import { db } from '../db/client';

export interface AutoAssignResult {
    boas_scanned: number;
    rows_inserted: number;
    skipped_revoked: number;
}

export async function ensureBoaCampusAssignments(): Promise<AutoAssignResult> {
    const client = await db.connect();
    try {
        // Count BOAs we'll scan
        const boaCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM public.users
              WHERE role = 'BOA' AND (is_active IS NULL OR is_active = true)`,
        );
        const boas_scanned = parseInt(boaCount.rows[0]?.count ?? '0', 10);

        // Count already-revoked pairs we're skipping (so admins can see the
        // delta between "auto-eligible" and "actually assigned").
        const revokedCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ops_os.user_campus_assignment uca
              WHERE uca.role = 'BOA' AND uca.revoked_at IS NOT NULL`,
        );
        const skipped_revoked = parseInt(revokedCount.rows[0]?.count ?? '0', 10);

        // Insert one row per (BOA user, campus in user's universities) pair
        // that does not already exist. Tries primary university_id first,
        // then falls back to the user_universities junction (multi-tenant
        // BOAs).
        const ins = await client.query<{ user_id: string; campus_id: string }>(
            `INSERT INTO ops_os.user_campus_assignment (user_id, campus_id, role, assigned_at)
             SELECT DISTINCT u.id, cd.campus_id, 'BOA', now()
               FROM public.users u
               LEFT JOIN public.user_universities uu ON uu.user_id = u.id
               JOIN ops_os.campus_dim cd
                 ON (cd.university_id = u.university_id OR cd.university_id = uu.university_id)
                AND cd.status = 'active'
              WHERE u.role = 'BOA'
                AND (u.is_active IS NULL OR u.is_active = true)
                AND cd.university_id IS NOT NULL
             ON CONFLICT (user_id, campus_id, role) DO NOTHING
             RETURNING user_id, campus_id`,
        );

        return {
            boas_scanned,
            rows_inserted: ins.rowCount ?? 0,
            skipped_revoked,
        };
    } finally {
        client.release();
    }
}
