import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, transitionBudgetProposalStatus, type BudgetProposalStatus } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const { action, reason, approvedBudget } = await request.json();
    if (!action) throw error(400, 'Action is required');

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    // RBAC
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isCMAManager = locals.user.role === 'CMA_MANAGER';

    if (!isSET && !isGlobalAdmin && !isCMAManager) {
        throw error(403, 'Forbidden: Only SET reviewers, CMA managers, or admins can perform review actions');
    }

    // Scoping check — CMA_MANAGER and SET need university-level access; global admins bypass
    if (!isGlobalAdmin) {
        const hasAccess = locals.user.universities?.some(u => u.id === proposal.university_id);
        if (!hasAccess) throw error(403, 'Forbidden: You do not have access to this university');
    }

    let toStatus: BudgetProposalStatus;

    switch (action) {
        case 'start':
            if (proposal.status !== 'SUBMITTED') throw error(400, 'Can only start review if status is SUBMITTED');
            toStatus = 'UNDER_REVIEW';
            break;
        case 'approve':
            // CMA_MANAGER (not admin) → L1 approval
            if (isCMAManager && !isGlobalAdmin) {
                if (proposal.status !== 'SUBMITTED' && proposal.status !== 'UNDER_REVIEW') {
                    throw error(400, 'Invalid status for L1 approval. Must be SUBMITTED or UNDER_REVIEW');
                }
                toStatus = 'APPROVED_L1';
            } else if (isGlobalAdmin) {
                // Admin → final approval (can also approve directly from APPROVED_L1)
                if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1') {
                    throw error(400, 'Invalid status for final approval. Must be SUBMITTED, UNDER_REVIEW, or APPROVED_L1');
                }
                if (approvedBudget === undefined) throw error(400, 'Approved budget is required for final approval');
                toStatus = 'APPROVED';
            } else {
                throw error(403, 'Forbidden: Only CMA managers or admins can approve budget proposals');
            }
            break;
        case 'reject':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1') {
                throw error(400, 'Invalid status for rejection');
            }
            if (!reason) throw error(400, 'Reason is required for rejection');
            toStatus = 'REJECTED';
            break;
        case 'request-changes':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1' && proposal.status !== 'REPORT_SUBMITTED') {
                throw error(400, 'Invalid transition for requesting changes');
            }
            if (!reason) throw error(400, 'Reason is required for requesting changes');
            toStatus = 'CHANGES_REQUESTED';
            break;
        case 'close':
            if (!isGlobalAdmin) throw error(403, 'Forbidden: Only administrators can close finalized reports');
            if (proposal.status !== 'REPORT_SUBMITTED') throw error(400, 'Can only close if report is submitted');
            toStatus = 'CLOSED';
            break;
        default:
            throw error(400, `Unknown action: ${action}`);
    }

    await transitionBudgetProposalStatus(
        params.id,
        toStatus,
        { id: locals.user.id, name: locals.user.name || locals.user.email },
        reason,
        approvedBudget
    );

    // Notify
    const updatedProposal = await getBudgetProposalById(params.id);
    if (updatedProposal && toStatus !== 'UNDER_REVIEW') { // Don't notify for "Under Review" start
        await notifyBudgetProposalUpdate(updatedProposal, toStatus, locals.user.name || locals.user.email, reason);
    }

    return json({ success: true });
};
