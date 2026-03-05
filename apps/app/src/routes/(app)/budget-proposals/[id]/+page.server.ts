import { error } from '@sveltejs/kit';
import { getBudgetProposalById, getBudgetProposalAuditLogs, getBudgetProposalComments, getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const [proposal, auditLogs, universities] = await Promise.all([
        getBudgetProposalById(params.id),
        getBudgetProposalAuditLogs(params.id),
        getAllUniversities()
    ]);

    if (!proposal) throw error(404, 'Budget proposal not found');

    // Scoping check
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isProposer = proposal.proposer_user_id === locals.user.id;

    if (!isGlobalAdmin && !isSET && !isProposer) {
        const hasAccess = locals.user.universities?.some(u => u.id === proposal.university_id);
        if (!hasAccess) throw error(403, 'Forbidden: You do not have access to this proposal');
    }

    // Comments scoping
    const comments = await getBudgetProposalComments(params.id, isSET || isGlobalAdmin);

    return {
        proposal: JSON.parse(JSON.stringify(proposal)),
        auditLogs: JSON.parse(JSON.stringify(auditLogs)),
        comments: JSON.parse(JSON.stringify(comments)),
        universities: JSON.parse(JSON.stringify(universities))
    };
};
