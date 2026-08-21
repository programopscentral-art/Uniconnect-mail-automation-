import { error } from '@sveltejs/kit';

/**
 * Shared RBAC/scoping helpers for petty-cash endpoints.
 *
 * Approver / disburser / verifier / settler roles = the finance approvers
 * ("Satish" and admins). Global admins bypass university scoping.
 */
const FINANCE_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS'];
const GLOBAL_ROLES = ['ADMIN', 'PROGRAM_OPS'];

export function isFinance(user: any): boolean {
    return FINANCE_ROLES.includes(user?.role);
}
export function isGlobalAdmin(user: any): boolean {
    return GLOBAL_ROLES.includes(user?.role);
}

export function assertFinance(user: any) {
    if (!isFinance(user)) throw error(403, 'Only finance approvers (CMA Manager / Admin) can perform this action.');
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
