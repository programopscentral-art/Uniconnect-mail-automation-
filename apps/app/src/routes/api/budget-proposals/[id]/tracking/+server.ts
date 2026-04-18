/**
 * GET /api/budget-proposals/[id]/tracking
 * Returns the Amazon-style tracking timeline for a budget proposal.
 * Auto-backfills from proposal state if no tracking entries exist yet.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProposalTimeline, backfillTrackingFromProposal, db } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const proposalId = params.id;

    // Fetch the proposal to auto-backfill
    try {
        const propRes = await db.query(
            `SELECT * FROM budget_proposals WHERE id = $1`, [proposalId]
        );
        if (propRes.rows.length > 0) {
            await backfillTrackingFromProposal(propRes.rows[0]);
        }
    } catch {}

    const timeline = await getProposalTimeline(proposalId);
    return json({ timeline });
};
