/**
 * Operations OS — auto campus assignment.
 *
 * Bridges public.user_universities (which says "this user belongs to UNI X")
 * with ops_os.user_campus_assignment (which gates page access + RLS scope
 * to specific campuses). Without a row in user_campus_assignment a BOA
 * sees an empty campus dropdown on /ops-os/report and a PM sees an empty
 * review queue.
 *
 * Role mapping (note the chk_uca_role CHECK on the table only allows
 * 'BOA' or 'PM' — so PMA users get DUAL rows so they pick up both
 * BOA-scoped data and PM-scoped data):
 *
 *   public.users.role='BOA'  →  ('BOA',)
 *   public.users.role='PM'   →  ('PM',)
 *   public.users.role='PMA'  →  ('BOA', 'PM')      (assists BOA and PM)
 *
 * For each such user, ensures one assignment row per active campus_dim
 * row whose university_id is in that user's universities list (primary
 * users.university_id OR junction user_universities). Idempotent via
 * INSERT ... ON CONFLICT DO NOTHING and the (user_id, campus_id, role)
 * primary key.
 *
 * Previously soft-revoked pairs (revoked_at IS NOT NULL) are NOT
 * resurrected — admins must explicitly re-grant via the Access Rights UI.
 *
 * Safe to run at every boot.
 */

import { db } from '../db/client';

export interface AutoAssignResult {
    users_scanned: number;
    rows_inserted: number;
    skipped_revoked: number;
}

export async function ensureBoaCampusAssignments(): Promise<AutoAssignResult> {
    const client = await db.connect();
    try {
        const userCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM public.users
              WHERE role IN ('BOA', 'PM', 'PMA')
                AND (is_active IS NULL OR is_active = true)`,
        );
        const users_scanned = parseInt(userCount.rows[0]?.count ?? '0', 10);

        const revokedCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ops_os.user_campus_assignment uca
              WHERE uca.role IN ('BOA', 'PM') AND uca.revoked_at IS NOT NULL`,
        );
        const skipped_revoked = parseInt(revokedCount.rows[0]?.count ?? '0', 10);

        // Bulk insert via a single CTE that explodes (user, campus, role)
        // pairs per the role-mapping table above. INSERT...SELECT ON
        // CONFLICT DO NOTHING is idempotent.
        const ins = await client.query<{ user_id: string; campus_id: string; role: string }>(
            `WITH role_map(public_role, uca_role) AS (
                VALUES
                  ('BOA', 'BOA'),
                  ('PM',  'PM'),
                  ('PMA', 'BOA'),
                  ('PMA', 'PM')
             ),
             expanded AS (
                SELECT DISTINCT u.id AS user_id, cd.campus_id, rm.uca_role AS role
                  FROM public.users u
                  JOIN role_map rm ON rm.public_role = u.role
                  LEFT JOIN public.user_universities uu ON uu.user_id = u.id
                  JOIN ops_os.campus_dim cd
                    ON (cd.university_id = u.university_id OR cd.university_id = uu.university_id)
                   AND cd.status = 'active'
                 WHERE (u.is_active IS NULL OR u.is_active = true)
                   AND cd.university_id IS NOT NULL
             )
             INSERT INTO ops_os.user_campus_assignment (user_id, campus_id, role, assigned_at)
             SELECT user_id, campus_id, role, now() FROM expanded
             ON CONFLICT (user_id, campus_id, role) DO NOTHING
             RETURNING user_id, campus_id, role`,
        );

        return {
            users_scanned,
            rows_inserted: ins.rowCount ?? 0,
            skipped_revoked,
        };
    } finally {
        client.release();
    }
}
