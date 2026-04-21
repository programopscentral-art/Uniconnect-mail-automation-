/**
 * POST /api/ops/sync-to-facilities
 * One-time sync: sends all existing APPROVED budget proposals to Facilities OS
 * so they appear on the Kanban board. Safe to run multiple times — Facilities
 * OS should handle duplicates via budget_proposal_id.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Only admins can trigger sync');
    }

    const facilitiesUrl = env.FACILITIES_OS_WEBHOOK_URL || process.env.FACILITIES_OS_WEBHOOK_URL;
    const secret = env.FACILITIES_WEBHOOK_SECRET || process.env.FACILITIES_WEBHOOK_SECRET || 'uniconnect-facilities-2026';

    if (!facilitiesUrl) {
        return json({ success: false, error: 'FACILITIES_OS_WEBHOOK_URL not set in env vars' }, { status: 400 });
    }

    // Get all approved proposals
    const proposalsRes = await db.query(`
        SELECT bp.*,
               COALESCE(univ.short_name, univ.name) AS university_name
        FROM budget_proposals bp
        LEFT JOIN universities univ ON univ.id = bp.university_id
        WHERE bp.status IN ('APPROVED', 'EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED')
        ORDER BY bp.created_at DESC
    `);

    const proposals = proposalsRes.rows;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const proposal of proposals) {
        try {
            // Get items
            const itemsRes = await db.query(
                `SELECT * FROM budget_proposal_items WHERE proposal_id = $1`,
                [proposal.id]
            );

            // Build approvals from tracking or proposal data
            const approvals: any[] = [];
            // Try to get from tracking table
            try {
                const trackRes = await db.query(
                    `SELECT * FROM budget_proposal_tracking
                     WHERE proposal_id = $1 AND status IN ('cm_approved', 'approved_l1', 'admin_approved', 'approved')
                     ORDER BY created_at`,
                    [proposal.id]
                );
                for (const t of trackRes.rows) {
                    approvals.push({
                        name: t.updated_by_name || 'Unknown',
                        email: t.updated_by_email || '',
                        role: t.status.includes('admin') ? 'ADMIN' : 'CMA_MANAGER',
                        approved_at: t.created_at
                    });
                }
            } catch {}

            // If no tracking entries, add a generic one
            if (approvals.length === 0) {
                approvals.push({
                    name: 'System',
                    email: '',
                    role: 'ADMIN',
                    approved_at: proposal.updated_at || proposal.created_at
                });
            }

            const res = await fetch(facilitiesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-secret': secret
                },
                body: JSON.stringify({
                    action: 'proposal_approved',
                    proposal: {
                        id: proposal.id,
                        title: proposal.title,
                        description: proposal.description,
                        university_id: proposal.university_id,
                        university_name: proposal.university_name,
                        proposer_name: proposal.proposer_name,
                        proposer_email: proposal.proposer_email,
                        estimated_total_budget: proposal.estimated_total_budget,
                        approved_total_budget: proposal.approved_total_budget || proposal.estimated_total_budget,
                        proposed_date: proposal.proposed_date,
                        venue: proposal.venue,
                        priority: proposal.priority || 'MED'
                    },
                    items: itemsRes.rows,
                    approvals
                })
            });

            if (res.ok) {
                sent++;
            } else {
                const errBody = await res.text().catch(() => '');
                failed++;
                errors.push(`${proposal.title}: HTTP ${res.status} — ${errBody.slice(0, 100)}`);
            }

            // Small delay to not overwhelm the server
            await new Promise(r => setTimeout(r, 200));

        } catch (e: any) {
            failed++;
            errors.push(`${proposal.title}: ${e.message}`);
        }
    }

    return json({
        success: true,
        total: proposals.length,
        sent,
        failed,
        errors: errors.slice(0, 10)
    });
};
