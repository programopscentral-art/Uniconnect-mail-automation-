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

    // RBAC: Only SET_REVIEWER, ADMIN, or PROGRAM_OPS
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';

    if (!isSET && !isGlobalAdmin) {
        throw error(403, 'Forbidden: Only SET reviewers or admins can perform review actions');
    }

    // Scoping check
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
            if (proposal.status === 'UNDER_REVIEW') {
                if (approvedBudget === undefined) throw error(400, 'Approved budget is required for L1 approval');
                toStatus = 'APPROVED_L1';
            } else if (proposal.status === 'APPROVED_L1') {
                if (!isGlobalAdmin) throw error(403, 'Only admins/ops can perform final approval');
                toStatus = 'APPROVED';
            } else {
                throw error(400, 'Invalid status for approval');
            }
            break;
        case 'reject':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'APPROVED_L1') throw error(400, 'Invalid status for rejection');
            if (!reason) throw error(400, 'Reason is required for rejection');
            toStatus = 'REJECTED';
            break;
        case 'request-changes':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'APPROVED_L1' && proposal.status !== 'REPORT_SUBMITTED') {
                throw error(400, 'Invalid transition for requesting changes');
            }
            if (!reason) throw error(400, 'Reason is required for requesting changes');
            toStatus = 'CHANGES_REQUESTED';
            break;
        case 'close':
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
        await notifyBudgetProposalUpdate(updatedProposal, toStatus, locals.user.name || locals.user.email);
    }

    return json({ success: true });
};
