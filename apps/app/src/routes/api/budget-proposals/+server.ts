import { json, error } from '@sveltejs/kit';
import { getBudgetProposals, createBudgetProposal, transitionBudgetProposalStatus } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const university_id = url.searchParams.get('university_id') || undefined;
    const status = url.searchParams.get('status') as any || undefined;
    const search = url.searchParams.get('search') || undefined;
    const mine = url.searchParams.get('mine') === 'true';

    // RBAC & Scoping — full-access users (e.g. Central Team) see all universities.
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' || locals.user.role === 'CMA_MANAGER' || (locals.user as any).full_access === true;
    const isSET = locals.user.role === 'SET_REVIEWER';

    // Determine effective university filter
    let effectiveUniversityId = university_id;

    if (!isGlobalAdmin) {
        if (university_id) {
            // Check if user has access to requested university
            const hasAccess = locals.user.universities?.some(u => u.id === university_id);
            if (!hasAccess && !isSET) { // SET might have cross-university access defined elsewhere, but for now we follow user.universities
                throw error(403, 'Forbidden: You do not have access to this university');
            }
        } else if (locals.user.university_id) {
            effectiveUniversityId = locals.user.university_id;
        }
    }

    const proposals = await getBudgetProposals({
        university_id: effectiveUniversityId,
        proposer_user_id: mine ? locals.user.id : undefined,
        status,
        search,
        limit: 50
    });

    return json(proposals);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const data = await request.json();

    // Validation
    if (!data.university_id) throw error(400, 'University ID is required');
    if (!data.title) throw error(400, 'Title is required');
    if (!data.proposed_date) throw error(400, 'Proposed date is required');
    if (!data.items || !Array.isArray(data.items)) throw error(400, 'Budget items are required');

    // Scoping check
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' || locals.user.role === 'CMA_MANAGER';
    if (!isGlobalAdmin) {
        const hasAccess = locals.user.universities?.some(u => u.id === data.university_id);
        if (!hasAccess) throw error(403, 'Forbidden: You do not have access to this university');
    }

    const proposal = await createBudgetProposal({
        ...data,
        proposer_user_id: locals.user.id,
        proposer_name: locals.user.name || undefined,
        proposer_email: locals.user.email
    });

    if (proposal) {
        // Transition to SUBMITTED immediately upon creation for tracking
        await transitionBudgetProposalStatus(
            proposal.id,
            'SUBMITTED',
            { id: locals.user.id, name: locals.user.name || locals.user.email },
            'Initial Submission'
        );

        // Notify Admins/Ops (the "Main Mails")
        await notifyBudgetProposalUpdate(
            { ...proposal, status: 'SUBMITTED' },
            'SUBMITTED',
            locals.user.name || locals.user.email
        );
    }

    return json(proposal);
};
