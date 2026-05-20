/**
 * Fee Collection — RBAC + 8 PM IST lock helpers.
 *
 * Permission model (from requirements doc):
 *   - ADMIN / PROGRAM_OPS         → full access (view + edit payments + edit remarks/tags + unlock)
 *   - Managers / Directors        → view only (DIRECTOR / VP_ROLE etc.)
 *   - PM / PMA / COS / BOA / CMA  → view + edit remarks + edit tags  (NOT payment amounts)
 *   - Anyone with 'fee-collection' permission → view
 */
import { error } from '@sveltejs/kit';

export type FeeAccessMode = 'view' | 'edit_remarks' | 'edit_payments' | 'admin';

const FULL_ADMIN_ROLES = ['ADMIN', 'PROGRAM_OPS'];
const REMARK_EDIT_ROLES = ['PM', 'PMA', 'COS', 'CMA', 'CMA_MANAGER', 'BOA'];

export function checkFeeAccess(locals: any, mode: FeeAccessMode = 'view') {
    if (!locals.user) throw error(401);
    const role = locals.user.role as string;

    // Admins always pass everything
    if (FULL_ADMIN_ROLES.includes(role)) return;

    // Need the permission to do anything in fee-collection
    const perms: string[] = locals.user.permissions || [];
    if (!perms.includes('fee-collection')) {
        throw error(403, 'You do not have access to Fee Collection. Ask an admin to enable the "fee-collection" permission for your role.');
    }

    if (mode === 'view') return;

    // Edit modes
    if (mode === 'edit_remarks') {
        if (REMARK_EDIT_ROLES.includes(role)) return;
        throw error(403, 'Only PM/PMA/COS/BOA/CMA can add or edit remarks and tags.');
    }

    if (mode === 'edit_payments' || mode === 'admin') {
        throw error(403, 'Only admins can edit payment amounts or unlock locked entries.');
    }
}

export function isAdminRole(locals: any): boolean {
    if (!locals.user) return false;
    return FULL_ADMIN_ROLES.includes(locals.user.role);
}

/**
 * Returns true if the current IST clock time is past 8 PM (20:00).
 * Used to lock fee_daily_log edits for today after the cutoff.
 */
export function isPast8PmIST(): boolean {
    const nowUtc = new Date();
    const istMs = nowUtc.getTime() + 5.5 * 60 * 60 * 1000;
    const ist = new Date(istMs);
    return ist.getUTCHours() >= 20;
}

export function todayInIST(): string {
    const nowUtc = new Date();
    const istMs = nowUtc.getTime() + 5.5 * 60 * 60 * 1000;
    return new Date(istMs).toISOString().split('T')[0];
}
