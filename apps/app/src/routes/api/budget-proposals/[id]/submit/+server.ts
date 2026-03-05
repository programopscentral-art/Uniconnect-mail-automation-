import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, transitionBudgetProposalStatus } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    // ONLY DRAFT or CHANGES_REQUESTED can be submitted
    if (proposal.status !== 'DRAFT' && proposal.status !== 'CHANGES_REQUESTED') {
        throw error(400, 'Invalid transition: Proposal is not in a submittable state');
    }

    // Only proposer or admin
    if (proposal.proposer_user_id !== locals.user.id && locals.user.role !== 'ADMIN') {
        throw error(403, 'Forbidden: Only the proposer can submit this proposal');
    }

    await transitionBudgetProposalStatus(
        params.id,
        'SUBMITTED',
        { id: locals.user.id, name: locals.user.name || locals.user.email }
    );

    // Fetch updated proposal for notification
    const updatedProposal = await getBudgetProposalById(params.id);
    if (updatedProposal) {
        await notifyBudgetProposalUpdate(updatedProposal, 'SUBMITTED', locals.user.name || locals.user.email);
    }

    return json({ success: true });
};
