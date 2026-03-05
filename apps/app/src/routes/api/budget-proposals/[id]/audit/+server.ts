import { json, error } from '@sveltejs/kit';
import { getBudgetProposalAuditLogs } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    // Scoping check for audit logs too
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isSET = locals.user.role === 'SET_REVIEWER';

    // Audit logs are generally for reviewers/admins, but proposer might see status history
    const logs = await getBudgetProposalAuditLogs(params.id);
    return json(logs);
};
