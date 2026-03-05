import { json, error } from '@sveltejs/kit';
import { getBudgetProposalComments, addBudgetProposalComment } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';

    // Proposers can only see PUBLIC comments. SET/Admin can see both.
    const comments = await getBudgetProposalComments(params.id, isSET || isGlobalAdmin);
    return json(comments);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const { comment, visibility } = await request.json();
    if (!comment) throw error(400, 'Comment content required');

    const isSET = locals.user.role === 'SET_REVIEWER';
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';

    // Non-SET/non-Admin can't post INTERNAL comments
    const effectiveVisibility = (visibility === 'INTERNAL' && (isSET || isGlobalAdmin)) ? 'INTERNAL' : 'PUBLIC';

    const newComment = await addBudgetProposalComment(
        params.id,
        locals.user.id,
        locals.user.name || locals.user.email,
        comment,
        effectiveVisibility
    );

    return json(newComment);
};
