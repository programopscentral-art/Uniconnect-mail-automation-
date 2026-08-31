import { error } from '@sveltejs/kit';

/**
 * Shared RBAC/scoping helpers for petty-cash endpoints.
 *
 * - Approvers ("Satish" + admins) can approve / send back / reject.
 * - Finance-ops (approvers + Facilities) see the console and handle the money
 *   legs: disburse, verify bills, settle.
 * - Global admins bypass university scoping.
 */
const APPROVER_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS'];
const FINANCE_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS', 'FACILITIES'];
const GLOBAL_ROLES = ['ADMIN', 'PROGRAM_OPS'];

// The facilities managers who approve petty cash, named explicitly so they can
// approve regardless of their role (e.g. Satish is a Facilities user).
export const PC_APPROVER_EMAILS = ['programopscentral@nxtwave.in', 'satish.jada@nxtwave.co.in'];

/** Sees the Finance Console + can disburse / verify / settle. */
export function isFinance(user: any): boolean {
    return FINANCE_ROLES.includes(user?.role);
}
/** Can approve / send back / reject a request. */
export function isApprover(user: any): boolean {
    return APPROVER_ROLES.includes(user?.role)
        || PC_APPROVER_EMAILS.includes(String(user?.email || '').toLowerCase());
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

/** Global admins bypass; otherwise the user must belong to the university. */
export function assertUniversityAccess(user: any, universityId: string) {
    if (isGlobalAdmin(user)) return;
    const ok = user?.universities?.some((u: any) => u.id === universityId) || user?.university_id === universityId;
    if (!ok) throw error(403, 'You do not have access to this university.');
}

/** The default university filter for list/dashboard queries. */
export function scopeUniversity(user: any, requested?: string): string | undefined {
    if (isGlobalAdmin(user)) return requested || undefined;
    return requested || user?.university_id || undefined;
}
