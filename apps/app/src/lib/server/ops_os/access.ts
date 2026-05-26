/**
 * Operations OS — RBAC entry point for API routes.
 *
 * checkOpsOsAccess gates routes by mode:
 *
 *   - 'submit'       BOA on their own campus only
 *   - 'review'       PM/COS/admin
 *   - 'sign_off'     PM on their own campus, COS on cluster campuses, admins
 *   - 'send_back'    same as sign_off
 *   - 'view'         any authenticated role with ops_os.view permission OR
 *                    BOA/PM/COS on a campus they're assigned to
 *
 * The actual row-level scope (which campuses?) is enforced by Postgres RLS
 * inside withUserContext(). This helper does coarse role-level gating
 * (does this user's role have any business calling this endpoint at all?).
 */

import { error } from '@sveltejs/kit';

export type OpsOsAccessMode = 'view' | 'submit' | 'review' | 'sign_off' | 'send_back' | 'admin';

const ROLE_PERMISSIONS: Record<OpsOsAccessMode, ReadonlyArray<string>> = {
    view: ['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA', 'BOA', 'CMA', 'CMA_MANAGER', 'HR'],
    submit: ['ADMIN', 'PROGRAM_OPS', 'BOA', 'PMA'],
    review: ['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA'],
    sign_off: ['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA'],
    send_back: ['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA'],
    admin: ['ADMIN', 'PROGRAM_OPS'],
};

export interface OpsOsActor {
    user_id: string;
    role: string;
}

/**
 * Throws 401/403 if access is denied. Returns the actor on success.
 * Call from every ops_os API route as the first line of the handler.
 */
export function checkOpsOsAccess(locals: App.Locals, mode: OpsOsAccessMode): OpsOsActor {
    if (!locals.user) throw error(401, 'authentication required');
    const role = locals.user.role as string;
    const allowed = ROLE_PERMISSIONS[mode];
    if (!allowed.includes(role)) {
        throw error(403, `role ${role} is not permitted for ops_os.${mode}`);
    }
    return { user_id: locals.user.id, role };
}
