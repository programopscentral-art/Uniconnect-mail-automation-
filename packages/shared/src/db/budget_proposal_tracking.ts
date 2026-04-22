/**
 * Budget Proposal Tracking — Amazon-style order tracking.
 * Creates timeline entries and retrieves them for display.
 */
import { db } from './client';

let tableEnsured = false;

export async function ensureTrackingTable() {
    if (tableEnsured) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS budget_proposal_tracking (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                proposal_id uuid NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
                status text NOT NULL,
                title text NOT NULL,
                description text,
                updated_by_name text,
                updated_by_email text,
                attachment_urls text[],
                source text NOT NULL DEFAULT 'uniconnect',
                metadata jsonb,
                created_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        tableEnsured = true;
    } catch { tableEnsured = true; }
}

export async function getProposalTimeline(proposalId: string) {
    await ensureTrackingTable();
    const res = await db.query(
        `SELECT * FROM budget_proposal_tracking
         WHERE proposal_id = $1
         ORDER BY created_at ASC`,
        [proposalId]
    );
    return res.rows;
}

export async function addTrackingEntry(data: {
    proposal_id: string;
    status: string;
    title: string;
    description?: string;
    updated_by_name?: string;
    updated_by_email?: string;
    attachment_urls?: string[];
    source?: string;
    metadata?: any;
}) {
    await ensureTrackingTable();
    const res = await db.query(
        `INSERT INTO budget_proposal_tracking
            (proposal_id, status, title, description, updated_by_name, updated_by_email, attachment_urls, source, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            data.proposal_id, data.status, data.title,
            data.description || null, data.updated_by_name || null,
            data.updated_by_email || null, data.attachment_urls || null,
            data.source || 'uniconnect', data.metadata ? JSON.stringify(data.metadata) : null
        ]
    );
    return res.rows[0];
}

/**
 * Auto-populate tracking entries from existing proposal state.
 * Call this when viewing a proposal for the first time — fills in
 * submitted/approved entries from the proposal's own timestamps.
 */
export async function backfillTrackingFromProposal(proposal: any) {
    await ensureTrackingTable();
    const pid = proposal.id;

    // Check if already backfilled — but if entries exist only from 'uniconnect'
    // source (auto-backfill), clear and re-backfill to pick up budget-aware logic.
    const existing = await db.query(
        `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE source = 'facilities') AS facilities_count
         FROM budget_proposal_tracking WHERE proposal_id = $1`,
        [pid]
    );
    // If facilities has sent updates, don't re-backfill (would lose real data)
    if (existing.rows[0].facilities_count > 0) return;
    // If only uniconnect entries exist, clear and re-backfill with correct budget logic
    if (existing.rows[0].count > 0) {
        await db.query(`DELETE FROM budget_proposal_tracking WHERE proposal_id = $1 AND source = 'uniconnect'`, [pid]);
    }

    const entries: Array<{ status: string; title: string; description?: string; name?: string; date?: string }> = [];

    // Submitted
    entries.push({
        status: 'submitted',
        title: 'Proposal Submitted',
        description: proposal.title,
        name: proposal.proposer_name,
        date: proposal.created_at
    });

    // Status-based entries
    const statusOrder = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_L1', 'APPROVED_L2', 'APPROVED', 'EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED'];
    const currentIdx = statusOrder.indexOf(proposal.status);

    const budget = Number(proposal.estimated_total_budget) || 0;
    const needsAdmin = budget >= 10000;

    if (currentIdx >= statusOrder.indexOf('APPROVED_L1')) {
        entries.push({
            status: 'cm_approved',
            title: 'CMA Approved',
            description: needsAdmin
                ? `CMA approved — awaiting Admin approval (₹${budget.toLocaleString('en-IN')} ≥₹10K)`
                : `CMA approved — ready for procurement (₹${budget.toLocaleString('en-IN')} <₹10K)`,
            date: proposal.updated_at
        });
    }
    // Only add admin_approved step for ≥₹10K proposals that reached APPROVED
    if (needsAdmin && currentIdx >= statusOrder.indexOf('APPROVED')) {
        entries.push({
            status: 'admin_approved',
            title: 'Admin Approved',
            description: `Budget approved: ₹${proposal.approved_total_budget || proposal.estimated_total_budget}`,
            date: proposal.updated_at
        });
    }
    // For <₹10K, CMA approval = final approval, mark as sent to facilities
    if (!needsAdmin && currentIdx >= statusOrder.indexOf('APPROVED_L1')) {
        entries.push({
            status: 'sent_to_facilities',
            title: 'Sent to Facilities',
            description: 'CMA approval is sufficient for budgets under ₹10,000. Procurement can proceed.',
            date: proposal.updated_at
        });
    }
    if (currentIdx >= statusOrder.indexOf('EVENT_COMPLETED')) {
        entries.push({
            status: 'completed',
            title: 'Event Completed',
            date: proposal.updated_at
        });
    }

    for (const e of entries) {
        try {
            await db.query(
                `INSERT INTO budget_proposal_tracking
                    (proposal_id, status, title, description, updated_by_name, source, created_at)
                 VALUES ($1, $2, $3, $4, $5, 'uniconnect', $6)
                 ON CONFLICT DO NOTHING`,
                [pid, e.status, e.title, e.description || null, e.name || null, e.date || new Date().toISOString()]
            );
        } catch {}
    }
}
