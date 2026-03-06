import { db } from './client';

export type BudgetProposalStatus =
    | 'DRAFT'
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'CHANGES_REQUESTED'
    | 'APPROVED_L1'
    | 'APPROVED_L2'
    | 'APPROVED'
    | 'REJECTED'
    | 'EVENT_COMPLETED'
    | 'REPORT_SUBMITTED'
    | 'CLOSED';

export type BudgetItemCategory =
    | 'VENUE'
    | 'FOOD'
    | 'SPEAKER'
    | 'TRAVEL'
    | 'MARKETING'
    | 'AWARDS'
    | 'RECOGNITION'
    | 'HOSPITALITY'
    | 'CERTIFICATES'
    | 'GIFTS'
    | 'MISC';

export interface BudgetProposal {
    id: string;
    university_id: string;
    title: string;
    event_type: string;
    proposer_user_id: string;
    proposer_name: string | null;
    proposer_email: string;
    proposed_date: Date;
    venue: string | null;
    expected_attendance: number | null;
    description: string | null;
    priority: 'LOW' | 'MED' | 'HIGH';
    estimated_total_budget: number;
    approved_total_budget: number | null;
    status: BudgetProposalStatus;
    version: number;
    created_at: Date;
    updated_at: Date;
}

export interface BudgetItem {
    id: string;
    proposal_id: string;
    category: BudgetItemCategory;
    description: string;
    qty: number;
    unit_cost: number;
    amount: number;
    vendor_name: string | null;
    quotation_url: string | null;
    created_at: Date;
}

export interface BudgetProposalAttachment {
    id: string;
    proposal_id: string;
    file_url: string;
    file_name: string;
    file_type: string | null;
    uploaded_by: string | null;
    uploaded_at: Date;
}

export interface BudgetProposalComment {
    id: string;
    proposal_id: string;
    user_id: string;
    user_name: string | null;
    comment: string;
    visibility: 'INTERNAL' | 'PUBLIC';
    created_at: Date;
}

export interface BudgetProposalReport {
    id: string;
    proposal_id: string;
    actual_date: Date;
    actual_attendance: number | null;
    actual_budget_used: number | null;
    remaining_budget: number | null;
    outcomes: string | null;
    feedback_summary: string | null;
    issues_faced: string | null;
    photos_urls: string[];
    report_attachment_url: string | null;
    submitted_by: string;
    submitted_at: Date;
}

// 1. Create Proposal
export async function createBudgetProposal(data: {
    university_id: string;
    title: string;
    event_type: string;
    proposer_user_id: string;
    proposer_name?: string;
    proposer_email: string;
    proposed_date: string;
    venue?: string;
    expected_attendance?: number;
    description?: string;
    priority?: 'LOW' | 'MED' | 'HIGH';
    items: Omit<BudgetItem, 'id' | 'proposal_id' | 'created_at'>[];
}) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const estimatedTotal = data.items.reduce((sum, item) => sum + Number(item.amount), 0);

        const proposalRes = await client.query(
            `INSERT INTO budget_proposals (
                university_id, title, event_type, proposer_user_id, proposer_name, 
                proposer_email, proposed_date, venue, expected_attendance, description, 
                priority, estimated_total_budget
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                data.university_id, data.title, data.event_type, data.proposer_user_id, data.proposer_name || null,
                data.proposer_email, data.proposed_date, data.venue || null, data.expected_attendance || null,
                data.description || null, data.priority || 'MED', estimatedTotal
            ]
        );
        const proposal = proposalRes.rows[0];

        if (data.items.length > 0) {
            const itemValues = data.items.map((item, idx) =>
                `($1, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7}, $${idx * 7 + 8})`
            ).join(', ');

            const itemParams = [proposal.id];
            data.items.forEach(item => {
                itemParams.push(item.category, item.description, item.qty, item.unit_cost, item.amount, item.vendor_name || null, item.quotation_url || null);
            });

            await client.query(
                `INSERT INTO budget_proposal_items (proposal_id, category, description, qty, unit_cost, amount, vendor_name, quotation_url)
                 VALUES ${itemValues}`,
                itemParams
            );
        }

        // Initial Audit Log
        await client.query(
            `INSERT INTO budget_proposal_audit_log (proposal_id, action, to_status, actor_user_id, actor_name)
             VALUES ($1, 'CREATE', 'DRAFT', $2, $3)`,
            [proposal.id, data.proposer_user_id, data.proposer_name || data.proposer_email]
        );

        await client.query('COMMIT');
        return proposal as BudgetProposal;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function deleteBudgetProposal(id: string) {
    const res = await db.query(`DELETE FROM budget_proposals WHERE id = $1 RETURNING *`, [id]);
    return res.rows[0] as BudgetProposal | null;
}

// 2. Get Proposals with Filtering
export async function getBudgetProposals(filters: {
    university_id?: string;
    proposer_user_id?: string;
    status?: BudgetProposalStatus;
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
}) {
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (filters.university_id) {
        conditions.push(`p.university_id = $${i++}`);
        params.push(filters.university_id);
    }
    if (filters.proposer_user_id) {
        conditions.push(`p.proposer_user_id = $${i++}`);
        params.push(filters.proposer_user_id);
    }
    if (filters.status) {
        conditions.push(`p.status = $${i++}`);
        params.push(filters.status);
    }
    if (filters.startDate) {
        conditions.push(`p.proposed_date >= $${i++}`);
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        conditions.push(`p.proposed_date <= $${i++}`);
        params.push(filters.endDate);
    }
    if (filters.search) {
        conditions.push(`(p.title ILIKE $${i} OR p.description ILIKE $${i})`);
        params.push(`%${filters.search}%`);
        i++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ? ` LIMIT ${filters.limit}` : '';
    const offset = filters.offset ? ` OFFSET ${filters.offset}` : '';

    const query = `
        SELECT p.*, u.name as university_name
        FROM budget_proposals p
        JOIN universities u ON p.university_id = u.id
        ${where}
        ORDER BY p.created_at DESC
        ${limit} ${offset}
    `;

    const result = await db.query(query, params);
    return result.rows as (BudgetProposal & { university_name: string })[];
}

// 3. Get Full Proposal Details
export async function getBudgetProposalById(id: string) {
    const proposalRes = await db.query(
        `SELECT p.*, u.name as university_name 
         FROM budget_proposals p 
         JOIN universities u ON p.university_id = u.id
         WHERE p.id = $1`,
        [id]
    );
    if (proposalRes.rows.length === 0) return null;

    const itemsRes = await db.query(`SELECT * FROM budget_proposal_items WHERE proposal_id = $1`, [id]);
    const attachmentsRes = await db.query(`SELECT * FROM budget_proposal_attachments WHERE proposal_id = $1`, [id]);
    const reportRes = await db.query(`SELECT * FROM budget_proposal_reports WHERE proposal_id = $1`, [id]);

    return {
        ...proposalRes.rows[0],
        items: itemsRes.rows,
        attachments: attachmentsRes.rows,
        report: reportRes.rows[0] || null
    } as BudgetProposal & {
        university_name: string;
        items: BudgetItem[];
        attachments: BudgetProposalAttachment[];
        report: BudgetProposalReport | null
    };
}

// 4. Update Proposal
export async function updateBudgetProposal(id: string, data: Partial<BudgetProposal> & { items?: Omit<BudgetItem, 'id' | 'proposal_id' | 'created_at'>[] }, actor: { id: string; name: string }) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Check version for optimistic locking if provided
        if (data.version) {
            const current = await client.query('SELECT version FROM budget_proposals WHERE id = $1', [id]);
            if (current.rows[0]?.version !== data.version) {
                throw new Error('Optimistic locking failure: version mismatch');
            }
        }

        const fields: string[] = [];
        const params: any[] = [];
        let i = 1;

        const { items, ...proposalData } = data;

        // Auto-recalculate estimated total if items are provided
        if (items) {
            proposalData.estimated_total_budget = items.reduce((sum, item) => sum + Number(item.amount), 0);
        }

        Object.entries(proposalData).forEach(([key, val]) => {
            if (['title', 'event_type', 'proposed_date', 'venue', 'expected_attendance', 'description', 'priority', 'estimated_total_budget', 'approved_total_budget'].includes(key)) {
                fields.push(`${key} = $${i++}`);
                params.push(val);
            }
        });

        if (fields.length > 0) {
            fields.push(`version = version + 1`);
            params.push(id);
            await client.query(`UPDATE budget_proposals SET ${fields.join(', ')} WHERE id = $${i}`, params);
        }

        if (items) {
            await client.query(`DELETE FROM budget_proposal_items WHERE proposal_id = $1`, [id]);

            const itemValues = items.map((item, idx) =>
                `($1, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7}, $${idx * 7 + 8})`
            ).join(', ');

            const itemParams: any[] = [id];
            items.forEach(item => {
                itemParams.push(item.category, item.description, item.qty, item.unit_cost, item.amount, item.vendor_name || null, item.quotation_url || null);
            });

            await client.query(
                `INSERT INTO budget_proposal_items (proposal_id, category, description, qty, unit_cost, amount, vendor_name, quotation_url)
                 VALUES ${itemValues}`,
                itemParams
            );
        }

        await client.query(
            `INSERT INTO budget_proposal_audit_log (proposal_id, action, actor_user_id, actor_name, payload_json)
             VALUES ($1, 'EDIT', $2, $3, $4)`,
            [id, actor.id, actor.name, JSON.stringify(data)]
        );

        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// 5. Status Transitions
export async function transitionBudgetProposalStatus(id: string, toStatus: BudgetProposalStatus, actor: { id: string; name: string }, reason?: string, approvedBudget?: number) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const currentRes = await client.query('SELECT status, version FROM budget_proposals WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) throw new Error('Proposal not found');
        const fromStatus = currentRes.rows[0].status;

        // Validation logic for transitions (simplified, specialized checks in API)
        const fields = [`status = $1`, `version = version + 1`];
        const params: any[] = [toStatus, id];

        if (approvedBudget !== undefined) {
            fields.push(`approved_total_budget = $3`);
            params.push(approvedBudget);
        }

        await client.query(`UPDATE budget_proposals SET ${fields.join(', ')} WHERE id = $2`, params);

        await client.query(
            `INSERT INTO budget_proposal_audit_log (proposal_id, action, from_status, to_status, actor_user_id, actor_name, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, 'STATUS_CHANGE', fromStatus, toStatus, actor.id, actor.name, reason ? JSON.stringify({ reason }) : null]
        );

        if (reason) {
            await client.query(
                `INSERT INTO budget_proposal_comments (proposal_id, user_id, user_name, comment, visibility)
                 VALUES ($1, $2, $3, $4, 'PUBLIC')`,
                [id, actor.id, actor.name, `[Status Change to ${toStatus}] ${reason}`]
            );
        }

        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// 6. Comments
export async function addBudgetProposalComment(proposalId: string, userId: string, userName: string, comment: string, visibility: 'INTERNAL' | 'PUBLIC' = 'PUBLIC') {
    const res = await db.query(
        `INSERT INTO budget_proposal_comments (proposal_id, user_id, user_name, comment, visibility)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [proposalId, userId, userName, comment, visibility]
    );
    return res.rows[0] as BudgetProposalComment;
}

export async function getBudgetProposalComments(proposalId: string, includeInternal = false) {
    const query = includeInternal
        ? `SELECT * FROM budget_proposal_comments WHERE proposal_id = $1 ORDER BY created_at ASC`
        : `SELECT * FROM budget_proposal_comments WHERE proposal_id = $1 AND visibility = 'PUBLIC' ORDER BY created_at ASC`;
    const res = await db.query(query, [proposalId]);
    return res.rows as BudgetProposalComment[];
}

// 7. Attachments
export async function addBudgetProposalAttachment(data: {
    proposal_id: string;
    file_url: string;
    file_name: string;
    file_type?: string;
    uploaded_by: string;
}) {
    const res = await db.query(
        `INSERT INTO budget_proposal_attachments (proposal_id, file_url, file_name, file_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.proposal_id, data.file_url, data.file_name, data.file_type || null, data.uploaded_by]
    );
    return res.rows[0] as BudgetProposalAttachment;
}

export async function deleteBudgetProposalAttachment(id: string, proposalId: string) {
    const res = await db.query(
        `DELETE FROM budget_proposal_attachments WHERE id = $1 AND proposal_id = $2 RETURNING *`,
        [id, proposalId]
    );
    return res.rows[0] as BudgetProposalAttachment | null;
}

// 8. Reports
export async function submitBudgetProposalReport(proposalId: string, data: Omit<BudgetProposalReport, 'id' | 'proposal_id' | 'submitted_at'>) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const res = await client.query(
            `INSERT INTO budget_proposal_reports (
                proposal_id, actual_date, actual_attendance, actual_budget_used, 
                remaining_budget, outcomes, feedback_summary, issues_faced, 
                photos_urls, report_attachment_url, submitted_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (proposal_id) DO UPDATE SET
                actual_date = EXCLUDED.actual_date,
                actual_attendance = EXCLUDED.actual_attendance,
                actual_budget_used = EXCLUDED.actual_budget_used,
                remaining_budget = EXCLUDED.remaining_budget,
                outcomes = EXCLUDED.outcomes,
                feedback_summary = EXCLUDED.feedback_summary,
                issues_faced = EXCLUDED.issues_faced,
                photos_urls = EXCLUDED.photos_urls,
                report_attachment_url = EXCLUDED.report_attachment_url,
                submitted_by = EXCLUDED.submitted_by,
                submitted_at = NOW()
            RETURNING *`,
            [
                proposalId, data.actual_date, data.actual_attendance, data.actual_budget_used,
                data.remaining_budget, data.outcomes, data.feedback_summary, data.issues_faced,
                data.photos_urls, data.report_attachment_url, data.submitted_by
            ]
        );

        await client.query(
            `INSERT INTO budget_proposal_audit_log (proposal_id, action, actor_user_id, to_status)
             VALUES ($1, 'REPORT_SUBMIT', $2, 'REPORT_SUBMITTED')`,
            [proposalId, data.submitted_by]
        );

        await client.query(`UPDATE budget_proposals SET status = 'REPORT_SUBMITTED', version = version + 1 WHERE id = $1`, [proposalId]);

        await client.query('COMMIT');
        return res.rows[0] as BudgetProposalReport;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// 9. Audit Logs
export async function getBudgetProposalAuditLogs(proposalId: string) {
    const res = await db.query(
        `SELECT * FROM budget_proposal_audit_log WHERE proposal_id = $1 ORDER BY created_at DESC`,
        [proposalId]
    );
    return res.rows;
}

// 10. Scheduled Jobs Helpers
export async function getProposalsForCompletion() {
    const res = await db.query(
        `SELECT * FROM budget_proposals 
         WHERE status = 'APPROVED' AND proposed_date < NOW()`
    );
    return res.rows as BudgetProposal[];
}

export async function getProposalsForReportingReminders() {
    const res = await db.query(
        `SELECT * FROM budget_proposals 
         WHERE status = 'EVENT_COMPLETED' 
         AND updated_at < NOW() - INTERVAL '48 hours'
         AND id NOT IN (SELECT proposal_id FROM budget_proposal_audit_log WHERE action = 'REPORT_REMINDER_SENT' AND created_at > NOW() - INTERVAL '24 hours')`
    );
    return res.rows as BudgetProposal[];
}
// 11. Email Logs
export async function logBudgetProposalEmail(data: {
    proposal_id: string;
    event_type: string;
    recipient_email: string;
    status: 'SENT' | 'FAILED';
    provider_message_id?: string;
    failure_reason?: string;
}) {
    await db.query(
        `INSERT INTO budget_proposal_email_logs (proposal_id, event_type, recipient_email, status, provider_message_id, failure_reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.proposal_id, data.event_type, data.recipient_email, data.status, data.provider_message_id || null, data.failure_reason || null]
    );
}

export async function getBudgetProposalEmailLogs(proposalId: string) {
    const res = await db.query(
        `SELECT * FROM budget_proposal_email_logs WHERE proposal_id = $1 ORDER BY created_at DESC`,
        [proposalId]
    );
    return res.rows;
}
