import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, submitBudgetProposalReport } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const proposal = await getBudgetProposalById(params.id);
    if (!proposal || !proposal.report) throw error(404, 'Report not found');
    return json(proposal.report);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    // ONLY EVENT_COMPLETED or REPORT_SUBMITTED (for updates)
    if (proposal.status !== 'EVENT_COMPLETED' && proposal.status !== 'REPORT_SUBMITTED') {
        throw error(400, 'Invalid status: Report can only be submitted for completed events');
    }

    // Only proposer or admin
    if (proposal.proposer_user_id !== locals.user.id && locals.user.role !== 'ADMIN') {
        throw error(403, 'Forbidden: Only the proposer can submit this report');
    }

    const data = await request.json();

    // Validation
    if (!data.actual_date) throw error(400, 'Actual date is required');

    const report = await submitBudgetProposalReport(params.id, {
        ...data,
        submitted_by: locals.user.id
    });

    // Notify SET
    await notifyBudgetProposalUpdate(proposal, 'REPORT_SUBMITTED', locals.user.name || locals.user.email);

    return json(report);
};
