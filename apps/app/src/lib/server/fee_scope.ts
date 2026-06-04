/**
 * Per-user university scoping for fee-collection snapshot emails + XLSX
 * downloads.
 *
 * Why: PMs/COS/BOA shouldn't see every campus's numbers; they should see
 * only what they're responsible for. Admins (ADMIN / PROGRAM_OPS) +
 * Pavan + central ops continue to see the full org view.
 *
 * Mapping rules:
 *   - ADMIN / PROGRAM_OPS               → 'all' (no filter)
 *   - PM / PMA / BOA / CMA / CMA_MANAGER → universities of every active
 *     campus the user is assigned to via ops_os.user_campus_assignment
 *   - COS (ops_os.cluster_dim.cos_user_id) → universities of every campus
 *     in their cluster
 *   - Otherwise → 'subset' with whatever the union returns; if empty,
 *     no universities (effectively no data)
 */
import { db } from '@uniconnect/shared';

export type UniversityScope =
    | { type: 'all'; universityIds: null }
    | { type: 'subset'; universityIds: string[] };

const FULL_ACCESS_ROLES = new Set(['ADMIN', 'PROGRAM_OPS']);

/**
 * Look up the universities a user can see. Returns 'all' for admins, or a
 * concrete list of university UUIDs for PM/PMA/BOA/CMA/COS. Empty list
 * means the user has the role but no assignments — UI/email should still
 * render but with zero data and a clear "no campuses assigned" note.
 */
export async function getUserUniversityScope(
    userId: string | undefined | null,
    role: string | undefined | null,
): Promise<UniversityScope> {
    if (!userId) return { type: 'subset', universityIds: [] };
    if (role && FULL_ACCESS_ROLES.has(role)) {
        return { type: 'all', universityIds: null };
    }

    const r = await db.query(
        `WITH uu AS (
            -- Campuses assigned directly to the user (PM/PMA/BOA/CMA/etc.)
            SELECT cd.university_id
              FROM ops_os.user_campus_assignment uca
              JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id
             WHERE uca.user_id = $1
               AND uca.revoked_at IS NULL
            UNION
            -- Campuses in a cluster the user is the COS for
            SELECT cd.university_id
              FROM ops_os.cluster_dim cl
              JOIN ops_os.campus_dim cd ON cd.cluster_id = cl.cluster_id
             WHERE cl.cos_user_id = $1
         )
         SELECT DISTINCT university_id::text AS university_id
           FROM uu
          WHERE university_id IS NOT NULL`,
        [userId],
    );
    return { type: 'subset', universityIds: r.rows.map((x: { university_id: string }) => x.university_id) };
}

/**
 * Same lookup but keyed by email — used by the snapshot worker which has
 * a list of emails (PM/COS/admin/Pavan/central ops) and needs each one's
 * scope to build per-recipient personalised emails.
 */
export async function getEmailUniversityScope(email: string): Promise<UniversityScope> {
    const u = await db.query(
        `SELECT id::text AS id, role FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
    );
    if (u.rows.length === 0) return { type: 'subset', universityIds: [] };
    return getUserUniversityScope(u.rows[0].id, u.rows[0].role);
}

/**
 * Build a SQL `WHERE` fragment + param array for filtering by scope.
 * Returns `''` (no filter) when the scope is 'all', otherwise a
 * `AND <column> = ANY($N::uuid[])` that the caller appends and the
 * matching parameter value to push.
 *
 * Use like:
 *   const { sql, params } = scopeWhere(scope, 'fsp.university_id', baseParams.length);
 *   const query = `SELECT ... WHERE ... ${sql}`;
 *   baseParams.push(...params);
 */
export function scopeWhere(
    scope: UniversityScope,
    columnRef: string,
    nextParamIndex: number,
): { sql: string; params: unknown[] } {
    if (scope.type === 'all') return { sql: '', params: [] };
    return {
        sql: ` AND ${columnRef} = ANY($${nextParamIndex}::uuid[])`,
        params: [scope.universityIds],
    };
}

/**
 * Friendly label for the recipient-facing "scope" banner in emails and
 * the workbook header. Returns a short string like
 * "Aurora University, CDU, NSRIT" or null for admins/full-access.
 */
export async function scopeLabel(scope: UniversityScope): Promise<string | null> {
    if (scope.type === 'all') return null;
    if (scope.universityIds.length === 0) return 'no campuses assigned';
    const r = await db.query(
        `SELECT name FROM public.universities WHERE id = ANY($1::uuid[]) ORDER BY name`,
        [scope.universityIds],
    );
    return r.rows.map((x: { name: string }) => x.name).join(', ');
}
