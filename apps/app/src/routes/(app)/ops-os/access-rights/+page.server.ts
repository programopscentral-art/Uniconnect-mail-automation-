/**
 * Ops OS Access Rights — server load.
 *
 * ADMIN / PROGRAM_OPS only. Lists every active campus with its assigned
 * BOA and PM users (plus the cluster's COS) so admins can grant or revoke
 * page access on a per-campus basis.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '@uniconnect/shared';

export interface AssignmentRow {
    user_id: string;
    user_name: string;
    user_email: string;
    role: string;
    assigned_at: string;
    non_response_count: number;
}

export interface CampusAccess {
    campus_id: string;
    code: string;
    display_name: string;
    cluster_id: string;
    cluster_name: string;
    cos_user_id: string | null;
    cos_user_name: string | null;
    cos_user_email: string | null;
    boas: AssignmentRow[];
    pms: AssignmentRow[];
}

export interface UserOption {
    id: string;
    name: string;
    email: string;
    role: string;
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS'].includes(role)) {
        throw error(403, 'Access Rights is admin-only (ADMIN / PROGRAM_OPS).');
    }

    const client = await db.connect();
    try {
        const campusRows = await client.query<{
            campus_id: string;
            code: string;
            display_name: string;
            cluster_id: string;
            cluster_name: string;
            cos_user_id: string | null;
        }>(
            `SELECT cd.campus_id, cd.code, cd.display_name,
                    cd.cluster_id, cl.cluster_name, cl.cos_user_id
               FROM ops_os.campus_dim cd
               JOIN ops_os.cluster_dim cl ON cl.cluster_id = cd.cluster_id
              WHERE cd.status = 'active'
              ORDER BY cd.display_name`,
        );

        const assignmentRows = await client.query<{
            campus_id: string;
            user_id: string;
            user_name: string;
            user_email: string;
            role: string;
            assigned_at: string;
            non_response_count: number;
        }>(
            `SELECT uca.campus_id, uca.user_id,
                    COALESCE(u.name, u.email) AS user_name, u.email AS user_email,
                    uca.role,
                    uca.assigned_at::text AS assigned_at,
                    uca.non_response_count
               FROM ops_os.user_campus_assignment uca
               JOIN public.users u ON u.id = uca.user_id
              WHERE uca.revoked_at IS NULL
              ORDER BY uca.role, u.name`,
        );

        const cosIds = campusRows.rows
            .map(r => r.cos_user_id)
            .filter((v): v is string => !!v);
        let cosUsers: Record<string, { name: string; email: string }> = {};
        if (cosIds.length > 0) {
            const r = await client.query<{ id: string; name: string; email: string }>(
                `SELECT id, COALESCE(name, email) AS name, email
                   FROM public.users WHERE id = ANY($1::uuid[])`,
                [Array.from(new Set(cosIds))],
            );
            for (const row of r.rows) cosUsers[row.id] = { name: row.name, email: row.email };
        }

        // Build the campus list with nested assignments
        const campuses: CampusAccess[] = campusRows.rows.map(c => ({
            campus_id: c.campus_id,
            code: c.code,
            display_name: c.display_name,
            cluster_id: c.cluster_id,
            cluster_name: c.cluster_name,
            cos_user_id: c.cos_user_id,
            cos_user_name: c.cos_user_id ? (cosUsers[c.cos_user_id]?.name ?? null) : null,
            cos_user_email: c.cos_user_id ? (cosUsers[c.cos_user_id]?.email ?? null) : null,
            boas: [],
            pms: [],
        }));
        const campusById = new Map(campuses.map(c => [c.campus_id, c]));
        for (const a of assignmentRows.rows) {
            const c = campusById.get(a.campus_id);
            if (!c) continue;
            const row: AssignmentRow = {
                user_id: a.user_id,
                user_name: a.user_name,
                user_email: a.user_email,
                role: a.role,
                assigned_at: a.assigned_at,
                non_response_count: a.non_response_count,
            };
            if (a.role === 'BOA') c.boas.push(row);
            else if (a.role === 'PM') c.pms.push(row);
        }

        // List of all active users to populate the "add assignment" dropdown
        const usersRow = await client.query<UserOption>(
            `SELECT id, COALESCE(name, email) AS name, email, role
               FROM public.users
              WHERE (is_active IS NULL OR is_active = true)
                AND email IS NOT NULL
              ORDER BY name, email`,
        );

        // Unique clusters for the COS-edit panel
        const clusters = Array.from(
            new Map(
                campusRows.rows.map(r => [r.cluster_id, {
                    cluster_id: r.cluster_id,
                    cluster_name: r.cluster_name,
                    cos_user_id: r.cos_user_id,
                    cos_user_name: r.cos_user_id ? (cosUsers[r.cos_user_id]?.name ?? null) : null,
                    cos_user_email: r.cos_user_id ? (cosUsers[r.cos_user_id]?.email ?? null) : null,
                }]),
            ).values(),
        );

        return { campuses, users: usersRow.rows, clusters, role };
    } finally {
        client.release();
    }
};
