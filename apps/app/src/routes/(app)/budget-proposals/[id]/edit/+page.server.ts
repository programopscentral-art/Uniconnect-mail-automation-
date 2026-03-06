import { getBudgetProposalById, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const [proposal, universities] = await Promise.all([
        getBudgetProposalById(params.id),
        getAllUniversities()
    ]);

    if (!proposal) throw error(404, 'Proposal not found');

    // Only proposer or admin can edit
    const isProposer = proposal.proposer_user_id === locals.user.id;
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';

    if (!isProposer && !isGlobalAdmin) {
        throw error(403, 'Forbidden');
    }

    // Only DRAFT or CHANGES_REQUESTED can be edited
    if (proposal.status !== 'DRAFT' && proposal.status !== 'CHANGES_REQUESTED' && !isGlobalAdmin) {
        throw error(400, 'Proposal is not in an editable state');
    }

    return {
        proposal: JSON.parse(JSON.stringify(proposal)),
        universities: JSON.parse(JSON.stringify(universities))
    };
};
