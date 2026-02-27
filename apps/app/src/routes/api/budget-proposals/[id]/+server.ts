import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, updateBudgetProposal } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    // Scoping check
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isProposer = proposal.proposer_user_id === locals.user.id;

    if (!isGlobalAdmin && !isSET && !isProposer) {
        const hasAccess = locals.user.universities?.some(u => u.id === proposal.university_id);
        if (!hasAccess) throw error(403, 'Forbidden: You do not have access to this university');
    }

    return json(proposal);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    const data = await request.json();

    // Edit permission check
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isProposer = proposal.proposer_user_id === locals.user.id;

    // Proposer can only edit in DRAFT or CHANGES_REQUESTED
    if (isProposer && !isGlobalAdmin && !isSET) {
        if (proposal.status !== 'DRAFT' && proposal.status !== 'CHANGES_REQUESTED') {
            throw error(403, 'Proposals can only be edited in DRAFT or CHANGES_REQUESTED status');
        }
    } else if (!isGlobalAdmin && !isSET) {
        throw error(403, 'Forbidden: You do not have permission to edit this proposal');
    }

    await updateBudgetProposal(params.id, data, { id: locals.user.id, name: locals.user.name || locals.user.email });

    return json({ success: true });
};
