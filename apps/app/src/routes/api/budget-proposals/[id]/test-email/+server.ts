import { json, error } from '@sveltejs/kit';
import { db, logBudgetProposalEmail, getBudgetProposalById } from '@uniconnect/shared';
import { addNotificationJob } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user || locals.user.role !== 'ADMIN') throw error(403, 'Admin only');

    const type = url.searchParams.get('type') || 'APPROVED';
    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    const subject = `[TEST] Budget Proposal ${type}`;
    const body = `This is a test notification for your proposal: ${proposal.title}`;

    // Queue the email
    await addNotificationJob({
        to: proposal.proposer_email,
        subject,
        text: body,
        html: `<div>${body}</div>`
    });

    // Log the event
    await logBudgetProposalEmail({
        proposal_id: params.id,
        event_type: `TEST_${type}`,
        recipient_email: proposal.proposer_email,
        status: 'SENT'
    });

    return json({ success: true, message: `Test email queued for ${proposal.proposer_email}` });
};
