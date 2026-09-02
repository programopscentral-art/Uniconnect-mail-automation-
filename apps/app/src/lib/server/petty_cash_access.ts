import { error } from '@sveltejs/kit';

/**
 * Shared RBAC/scoping helpers for petty-cash endpoints.
 *
 * Two-level approval:
 *   - Level 1 (Pravalika): first review of the request / event.
 *   - Level 2 (Satish): budget check + final approval before money moves.
 * Finance-ops (approvers + Facilities) see the console and handle the money legs:
 * disburse, verify bills, settle. Petty cash is central, so finance / approvers /
 * full-access users are never university-scoped here.
 */
const FINANCE_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS', 'FACILITIES'];
const GLOBAL_ROLES = ['ADMIN', 'PROGRAM_OPS'];

// Petty cash approvers, matched by email so they work whatever role they hold.
export const PC_APPROVER_L1_EMAILS = ['pravalika.s@nxtwave.co.in']; // Level 1 — first approval
export const PC_APPROVER_L2_EMAILS = ['satish.jada@nxtwave.co.in'];  // Level 2 — final approval
// Anyone who can approve at some level (used for "is an approver at all" checks
// and to keep approvers out of the disburser mail list).
export const PC_APPROVER_EMAILS = [...PC_APPROVER_L1_EMAILS, ...PC_APPROVER_L2_EMAILS];

const emailOf = (user: any) => String(user?.email || '').toLowerCase();

/** Sees the Finance Console + can disburse / verify / settle. */
export function isFinance(user: any): boolean {
    return FINANCE_ROLES.includes(user?.role);
}
export function isApproverL1(user: any): boolean {
    return PC_APPROVER_L1_EMAILS.includes(emailOf(user));
}
export function isApproverL2(user: any): boolean {
    return PC_APPROVER_L2_EMAILS.includes(emailOf(user));
}
/** Can approve at some level (either L1 or L2). */
export function isApprover(user: any): boolean {
    return isApproverL1(user) || isApproverL2(user);
}
export function isGlobalAdmin(user: any): boolean {
    return GLOBAL_ROLES.includes(user?.role);
}

/** Which approver may act on a request in the given status (stage-aware). */
export function canApproveStage(user: any, status: string): boolean {
    if (status === 'SUBMITTED') return isApproverL1(user);
    if (status === 'L1_APPROVED') return isApproverL2(user);
    return false;
}
/** The level (1 or 2) that a given status is waiting on, else null. */
export function pendingLevel(status: string): 1 | 2 | null {
    if (status === 'SUBMITTED') return 1;
    if (status === 'L1_APPROVED') return 2;
    return null;
}

export function assertFinance(user: any) {
    if (!isFinance(user)) throw error(403, 'Only the finance team (Facilities / CMA Manager / Admin) can perform this action.');
}
/** Assert the acting user is the approver for this request's current stage. */
export function assertApproveStage(user: any, status: string) {
    if (canApproveStage(user, status)) return;
    if (status === 'SUBMITTED') throw error(403, 'Level-1 approval is Pravalika only.');
    if (status === 'L1_APPROVED') throw error(403, 'Level-2 (final) approval is Satish only.');
    throw error(400, 'This request is not awaiting approval.');
}

/**
 * Petty cash is a CENTRAL finance function: approvers and the finance team handle
 * every campus's requests, so finance users, global admins and full-access users
 * are never university-scoped here. Everyone else is limited to their universities.
 */
export function assertUniversityAccess(user: any, universityId: string) {
    if (isGlobalAdmin(user) || user?.full_access || isFinance(user)) return;
    const ok = user?.universities?.some((u: any) => u.id === universityId) || user?.university_id === universityId;
    if (!ok) throw error(403, 'You do not have access to this university.');
}

/** The default university filter for list/dashboard queries. */
export function scopeUniversity(user: any, requested?: string): string | undefined {
    if (isGlobalAdmin(user) || user?.full_access || isFinance(user)) return requested || undefined;
    return requested || user?.university_id || undefined;
}
