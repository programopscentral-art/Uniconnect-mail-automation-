import { error } from '@sveltejs/kit';
import { getBudgetProposalById } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    if (proposal.status !== 'EVENT_COMPLETED' && proposal.status !== 'REPORT_SUBMITTED') {
        throw error(403, 'Forbidden: Report cannot be submitted in this status');
    }

    // Only proposer can submit report
    if (proposal.proposer_user_id !== locals.user.id && locals.user.role !== 'ADMIN') {
        throw error(403, 'Forbidden: Only the proposer can submit this report');
    }

    return {
        proposal: JSON.parse(JSON.stringify(proposal))
    };
};
