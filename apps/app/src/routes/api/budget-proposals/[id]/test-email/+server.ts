import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, type BudgetProposalStatus } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import type { RequestHandler } from './$types';

// Admin-only endpoint to re-trigger the full rich notification for any status.
// Usage: POST /api/budget-proposals/[id]/test-email?status=APPROVED_L1
export const POST: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user || (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS')) {
        throw error(403, 'Admin only');
    }

    const status = (url.searchParams.get('status') || 'APPROVED_L1') as BudgetProposalStatus;
    const allowedStatuses: BudgetProposalStatus[] = [
        'SUBMITTED', 'APPROVED_L1', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'REPORT_SUBMITTED', 'CLOSED'
    ];
    if (!allowedStatuses.includes(status)) {
        throw error(400, `Invalid status. Allowed: ${allowedStatuses.join(', ')}`);
    }

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    await notifyBudgetProposalUpdate(
        proposal,
        status,
        locals.user.name || locals.user.email,
        status === 'CHANGES_REQUESTED' ? 'Please review and update the budget items.' : undefined
    );

    return json({ success: true, message: `Full notification sent for status ${status} — check emails` });
};
