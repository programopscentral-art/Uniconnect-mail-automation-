import { error } from '@sveltejs/kit';

/**
 * Shared RBAC/scoping helpers for petty-cash endpoints.
 *
 * - Approvers ("Satish" + admins) can approve / send back / reject.
 * - Finance-ops (approvers + Facilities) see the console and handle the money
 *   legs: disburse, verify bills, settle.
 * - Global admins bypass university scoping.
 */
const FINANCE_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS', 'FACILITIES'];
const GLOBAL_ROLES = ['ADMIN', 'PROGRAM_OPS'];

// Petty cash has a SINGLE approver — Satish. Nobody else can approve petty cash,
// regardless of role (matched by email so it works whatever role he holds).
export const PC_APPROVER_EMAILS = ['satish.jada@nxtwave.co.in'];

/** Sees the Finance Console + can disburse / verify / settle. */
export function isFinance(user: any): boolean {
    return FINANCE_ROLES.includes(user?.role);
}
/** Can approve / send back / reject a petty-cash request — Satish only. */
export function isApprover(user: any): boolean {
    return PC_APPROVER_EMAILS.includes(String(user?.email || '').toLowerCase());
}
export function isGlobalAdmin(user: any): boolean {
    return GLOBAL_ROLES.includes(user?.role);
}

export function assertFinance(user: any) {
    if (!isFinance(user)) throw error(403, 'Only the finance team (Facilities / CMA Manager / Admin) can perform this action.');
}
export function assertApprover(user: any) {
    if (!isApprover(user)) throw error(403, 'Only an approver (CMA Manager / Admin) can approve, send back, or reject.');
}

/** Global admins + full-access users bypass; otherwise the user must belong to the university. */
export function assertUniversityAccess(user: any, universityId: string) {
    if (isGlobalAdmin(user) || user?.full_access) return;
    const ok = user?.universities?.some((u: any) => u.id === universityId) || user?.university_id === universityId;
    if (!ok) throw error(403, 'You do not have access to this university.');
}

/** The default university filter for list/dashboard queries. */
export function scopeUniversity(user: any, requested?: string): string | undefined {
    if (isGlobalAdmin(user) || user?.full_access) return requested || undefined;
    return requested || user?.university_id || undefined;
}
