import { json, error } from '@sveltejs/kit';
import { getBudgetProposalById, transitionBudgetProposalStatus, addTrackingEntry, db, type BudgetProposalStatus } from '@uniconnect/shared';
import { notifyBudgetProposalUpdate } from '$lib/server/budget_proposals';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const { action, reason, approvedBudget } = await request.json();
    if (!action) throw error(400, 'Action is required');

    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    // RBAC
    const isSET = locals.user.role === 'SET_REVIEWER';
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isCMAManager = locals.user.role === 'CMA_MANAGER';

    if (!isSET && !isGlobalAdmin && !isCMAManager) {
        throw error(403, 'Forbidden: Only SET reviewers, CMA managers, or admins can perform review actions');
    }

    // Scoping check — CMA_MANAGER and SET need university-level access; global admins bypass
    if (!isGlobalAdmin) {
        const hasAccess = locals.user.universities?.some(u => u.id === proposal.university_id);
        if (!hasAccess) throw error(403, 'Forbidden: You do not have access to this university');
    }

    let toStatus: BudgetProposalStatus;

    switch (action) {
        case 'start':
            if (proposal.status !== 'SUBMITTED') throw error(400, 'Can only start review if status is SUBMITTED');
            toStatus = 'UNDER_REVIEW';
            break;
        case 'approve':
            // CMA_MANAGER (not admin) → L1 approval
            if (isCMAManager && !isGlobalAdmin) {
                if (proposal.status !== 'SUBMITTED' && proposal.status !== 'UNDER_REVIEW') {
                    throw error(400, 'Invalid status for L1 approval. Must be SUBMITTED or UNDER_REVIEW');
                }
                toStatus = 'APPROVED_L1';
            } else if (isGlobalAdmin) {
                // Admin → final approval (can also approve directly from APPROVED_L1)
                if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1') {
                    throw error(400, 'Invalid status for final approval. Must be SUBMITTED, UNDER_REVIEW, or APPROVED_L1');
                }
                if (approvedBudget === undefined) throw error(400, 'Approved budget is required for final approval');
                toStatus = 'APPROVED';
            } else {
                throw error(403, 'Forbidden: Only CMA managers or admins can approve budget proposals');
            }
            break;
        case 'reject':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1') {
                throw error(400, 'Invalid status for rejection');
            }
            if (!reason) throw error(400, 'Reason is required for rejection');
            toStatus = 'REJECTED';
            break;
        case 'request-changes':
            if (proposal.status !== 'UNDER_REVIEW' && proposal.status !== 'SUBMITTED' && proposal.status !== 'APPROVED_L1' && proposal.status !== 'REPORT_SUBMITTED') {
                throw error(400, 'Invalid transition for requesting changes');
            }
            if (!reason) throw error(400, 'Reason is required for requesting changes');
            toStatus = 'CHANGES_REQUESTED';
            break;
        case 'close':
            if (!isGlobalAdmin) throw error(403, 'Forbidden: Only administrators can close finalized reports');
            if (proposal.status !== 'REPORT_SUBMITTED') throw error(400, 'Can only close if report is submitted');
            toStatus = 'CLOSED';
            break;
        default:
            throw error(400, `Unknown action: ${action}`);
    }

    await transitionBudgetProposalStatus(
        params.id,
        toStatus,
        { id: locals.user.id, name: locals.user.name || locals.user.email },
        reason,
        approvedBudget
    );

    // Notify
    const updatedProposal = await getBudgetProposalById(params.id);
    if (updatedProposal && toStatus !== 'UNDER_REVIEW') {
        await notifyBudgetProposalUpdate(updatedProposal, toStatus, locals.user.name || locals.user.email, reason);
    }

    // Add tracking timeline entry
    const trackingTitles: Record<string, string> = {
        'UNDER_REVIEW': 'Under Review',
        'APPROVED_L1': 'CM Approved',
        'APPROVED': 'Admin Approved — Sent to Facilities',
        'REJECTED': 'Proposal Rejected',
        'CHANGES_REQUESTED': 'Changes Requested',
        'CLOSED': 'Proposal Closed'
    };
    try {
        await addTrackingEntry({
            proposal_id: params.id,
            status: toStatus.toLowerCase(),
            title: trackingTitles[toStatus] || toStatus,
            description: reason || (toStatus === 'APPROVED' ? `Budget approved: ₹${approvedBudget}` : undefined),
            updated_by_name: locals.user.name || locals.user.email,
            updated_by_email: locals.user.email,
            source: 'uniconnect'
        });
    } catch (e) {
        console.warn('[TRACKING] Failed to add tracking entry:', e);
    }

    // On ANY status change → webhook to Facilities OS so it stays in sync.
    // Facilities shows all proposals with their current approval status.
    if (updatedProposal) {
        const facilitiesUrl = env.FACILITIES_OS_WEBHOOK_URL || process.env.FACILITIES_OS_WEBHOOK_URL;
        if (facilitiesUrl) {
            try {
                // Fetch items for this proposal
                const itemsRes = await db.query(
                    `SELECT * FROM budget_proposal_items WHERE proposal_id = $1`,
                    [params.id]
                );
                const univRes = await db.query(
                    `SELECT COALESCE(short_name, name) AS name FROM universities WHERE id = $1`,
                    [updatedProposal.university_id]
                );

                await fetch(facilitiesUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-webhook-secret': env.FACILITIES_WEBHOOK_SECRET || 'facilities-webhook-key'
                    },
                    body: JSON.stringify({
                        action: 'proposal_approved',
                        proposal: (() => {
                            const budget = Number(updatedProposal.estimated_total_budget) || 0;
                            const needsAdmin = budget >= 10000;
                            const statusContext: Record<string, { approval_status: string; approval_note: string; can_proceed: boolean }> = {
                                'SUBMITTED': { approval_status: 'submitted', approval_note: 'Submitted — awaiting CMA approval', can_proceed: false },
                                'UNDER_REVIEW': { approval_status: 'under_review', approval_note: 'Under review by CMA', can_proceed: false },
                                'CHANGES_REQUESTED': { approval_status: 'changes_requested', approval_note: 'Changes requested', can_proceed: false },
                                'APPROVED_L1': {
                                    approval_status: needsAdmin ? 'needs_admin_approval' : 'l1_approved',
                                    approval_note: needsAdmin ? `CMA approved — awaiting Admin approval (₹${budget.toLocaleString('en-IN')} ≥₹10K)` : `CMA approved — ready for procurement (₹${budget.toLocaleString('en-IN')} <₹10K)`,
                                    can_proceed: !needsAdmin
                                },
                                'APPROVED': { approval_status: 'fully_approved', approval_note: 'Fully approved — proceed with procurement', can_proceed: true },
                                'REJECTED': { approval_status: 'rejected', approval_note: `Rejected${reason ? ': ' + reason : ''}`, can_proceed: false },
                                'EVENT_COMPLETED': { approval_status: 'event_completed', approval_note: 'Event completed', can_proceed: true },
                                'CLOSED': { approval_status: 'closed', approval_note: 'Closed', can_proceed: true },
                            };
                            const ctx = statusContext[toStatus] || { approval_status: toStatus.toLowerCase(), approval_note: toStatus, can_proceed: false };
                            return {
                                id: updatedProposal.id,
                                title: updatedProposal.title,
                                description: updatedProposal.description,
                                university_id: updatedProposal.university_id,
                                university_name: univRes.rows[0]?.name || '',
                                proposer_name: updatedProposal.proposer_name,
                                proposer_email: updatedProposal.proposer_email,
                                estimated_total_budget: updatedProposal.estimated_total_budget,
                                approved_total_budget: approvedBudget || updatedProposal.approved_total_budget,
                                proposed_date: updatedProposal.proposed_date,
                                venue: updatedProposal.venue,
                                priority: updatedProposal.priority,
                                status: toStatus,
                                ...ctx
                            };
                        })(),
                        items: itemsRes.rows.map((i: any) => ({ ...i, quantity: i.qty, unit_price: i.unit_cost, total_price: i.amount })),
                        approvals: [
                            { name: locals.user.name, email: locals.user.email, role: locals.user.role, status: toStatus, approved_at: new Date().toISOString() }
                        ]
                    })
                });
                console.log(`[WEBHOOK] Sent approved proposal ${params.id} to Facilities OS`);
            } catch (e) {
                console.warn('[WEBHOOK] Failed to send to Facilities OS:', e);
                // Non-blocking — approval still succeeds even if webhook fails
            }
        }
    }

    return json({ success: true });
};
