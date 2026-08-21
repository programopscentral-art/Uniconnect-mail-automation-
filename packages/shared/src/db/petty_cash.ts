import { db } from './client';

/**
 * Petty Cash Management — data layer.
 *
 * One request object moving through one lifecycle, with a permanent record
 * written at every hop. Mirrors the Budget Proposals patterns (state machine,
 * audit log, university scoping) on its own self-contained tables.
 */

export type PettyCashStatus =
    | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DISBURSED' | 'BILL_SUBMITTED'
    | 'BILL_VERIFIED' | 'SETTLED' | 'CLOSED' | 'SENT_BACK' | 'REJECTED' | 'CANCELLED';

export const PC_CATEGORIES = [
    'TRAVEL', 'FOOD', 'VENUE', 'PRINTING', 'STATIONERY', 'HOSPITALITY',
    'MAINTENANCE', 'COURIER', 'MARKETING', 'MISC',
] as const;

export interface PettyCashRequest {
    id: string;
    request_no: string | null;
    university_id: string;
    requester_user_id: string;
    requester_name?: string;
    requester_email: string;
    purpose: string;
    category: string;
    payee_vendor?: string;
    amount_requested: number;
    needed_by?: string | null;
    linked_activity?: string;
    status: PettyCashStatus;
    bill_due_on?: string | null;
    created_at: string;
    updated_at: string;
    // computed (list/detail)
    university_name?: string;
    amount_approved?: number;
    approved_at?: string | null;
    total_paid?: number;
    bill_total?: number;
    bill_count?: number;
    verified_count?: number;
    outstanding_amount?: number;
    bill_overdue?: boolean;
    settlement_balance?: number | null;
    settled_on?: string | null;
}

const LIST_SELECT = `
    SELECT r.*,
        COALESCE(u.short_name, u.name) AS university_name,
        ap.amount_approved, ap.approved_at,
        COALESCE(d.total_paid, 0) AS total_paid,
        COALESCE(b.bill_total, 0) AS bill_total,
        COALESCE(b.bill_count, 0) AS bill_count,
        COALESCE(b.verified_count, 0) AS verified_count,
        s.settled_on, s.balance_amount AS settlement_balance,
        CASE WHEN r.status IN ('SETTLED','CLOSED','REJECTED','CANCELLED') THEN 0
             ELSE COALESCE(d.total_paid, 0) END AS outstanding_amount,
        (r.status IN ('DISBURSED','BILL_SUBMITTED') AND r.bill_due_on IS NOT NULL AND r.bill_due_on < CURRENT_DATE) AS bill_overdue
    FROM petty_cash_requests r
    JOIN universities u ON u.id = r.university_id
    LEFT JOIN LATERAL (
        SELECT amount_approved, approved_at FROM petty_cash_approvals
        WHERE request_id = r.id AND approved_at IS NOT NULL
        ORDER BY approved_at DESC LIMIT 1
    ) ap ON true
    LEFT JOIN (
        SELECT request_id, SUM(amount_paid) AS total_paid
        FROM petty_cash_disbursements GROUP BY request_id
    ) d ON d.request_id = r.id
    LEFT JOIN (
        SELECT request_id, SUM(bill_amount) AS bill_total, COUNT(*) AS bill_count,
               COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verified_count
        FROM petty_cash_bills GROUP BY request_id
    ) b ON b.request_id = r.id
    LEFT JOIN LATERAL (
        SELECT settled_on, balance_amount FROM petty_cash_settlements
        WHERE request_id = r.id ORDER BY created_at DESC LIMIT 1
    ) s ON true
`;

function num(row: any): PettyCashRequest {
    for (const k of ['amount_requested', 'amount_approved', 'total_paid', 'bill_total', 'outstanding_amount', 'settlement_balance']) {
        if (row[k] !== null && row[k] !== undefined) row[k] = Number(row[k]);
    }
    for (const k of ['bill_count', 'verified_count']) {
        if (row[k] !== null && row[k] !== undefined) row[k] = Number(row[k]);
    }
    return row as PettyCashRequest;
}

export async function generateRequestNo(): Promise<string> {
    const { rows } = await db.query(`SELECT nextval('petty_cash_no_seq') AS n`);
    const n = Number(rows[0].n);
    const year = new Date().getFullYear();
    return `PC-${year}-${String(n).padStart(4, '0')}`;
}

export async function createPettyCashRequest(data: {
    university_id: string;
    requester_user_id: string;
    requester_name?: string;
    requester_email: string;
    purpose: string;
    category: string;
    payee_vendor?: string;
    amount_requested: number;
    needed_by?: string | null;
    linked_activity?: string;
}): Promise<PettyCashRequest> {
    const request_no = await generateRequestNo();
    const { rows } = await db.query(
        `INSERT INTO petty_cash_requests
           (request_no, university_id, requester_user_id, requester_name, requester_email,
            purpose, category, payee_vendor, amount_requested, needed_by, linked_activity, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT') RETURNING *`,
        [request_no, data.university_id, data.requester_user_id, data.requester_name || null,
         data.requester_email, data.purpose, data.category, data.payee_vendor || null,
         data.amount_requested, data.needed_by || null, data.linked_activity || null],
    );
    await addPettyCashAudit(rows[0].id, 'created', null, 'DRAFT',
        { id: data.requester_user_id, name: data.requester_name || data.requester_email }, 'Request drafted');
    return num(rows[0]);
}

export async function updatePettyCashRequest(id: string, data: Partial<PettyCashRequest>): Promise<PettyCashRequest> {
    const fields = ['purpose', 'category', 'payee_vendor', 'amount_requested', 'needed_by', 'linked_activity'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const f of fields) {
        if ((data as any)[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push((data as any)[f]); }
    }
    if (sets.length === 0) return getPettyCashRequestById(id).then(r => r!.request);
    vals.push(id);
    const { rows } = await db.query(
        `UPDATE petty_cash_requests SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`, vals);
    return num(rows[0]);
}

export async function getPettyCashRequests(filters: {
    university_id?: string;
    requester_user_id?: string;
    status?: PettyCashStatus | PettyCashStatus[];
    view?: string;
    search?: string;
    limit?: number;
} = {}): Promise<PettyCashRequest[]> {
    const where: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (filters.university_id) { where.push(`r.university_id = $${i++}`); vals.push(filters.university_id); }
    if (filters.requester_user_id) { where.push(`r.requester_user_id = $${i++}`); vals.push(filters.requester_user_id); }
    if (filters.status) {
        const arr = Array.isArray(filters.status) ? filters.status : [filters.status];
        where.push(`r.status = ANY($${i++})`); vals.push(arr);
    }
    if (filters.search) { where.push(`(r.purpose ILIKE $${i} OR r.request_no ILIKE $${i} OR r.payee_vendor ILIKE $${i} OR r.requester_name ILIKE $${i})`); vals.push(`%${filters.search}%`); i++; }

    // View-specific filters
    switch (filters.view) {
        case 'approvals': where.push(`r.status = 'SUBMITTED'`); break;
        case 'disbursement': where.push(`r.status = 'APPROVED'`); break;
        case 'bills': where.push(`r.status IN ('DISBURSED','BILL_SUBMITTED')`); break;
        case 'settlement': where.push(`r.status IN ('BILL_VERIFIED','DISBURSED','BILL_SUBMITTED')`); break;
    }

    const sql = LIST_SELECT + (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
        ` ORDER BY r.created_at DESC LIMIT ${Number(filters.limit) || 200}`;
    const { rows } = await db.query(sql, vals);
    return rows.map(num);
}

export async function getPettyCashRequestById(id: string) {
    const { rows } = await db.query(LIST_SELECT + ` WHERE r.id = $1`, [id]);
    if (rows.length === 0) return null;
    const request = num(rows[0]);
    const [approvals, disbursements, bills, settlements, audit] = await Promise.all([
        db.query(`SELECT * FROM petty_cash_approvals WHERE request_id = $1 ORDER BY created_at`, [id]),
        db.query(`SELECT * FROM petty_cash_disbursements WHERE request_id = $1 ORDER BY created_at`, [id]),
        db.query(`SELECT * FROM petty_cash_bills WHERE request_id = $1 ORDER BY created_at`, [id]),
        db.query(`SELECT * FROM petty_cash_settlements WHERE request_id = $1 ORDER BY created_at`, [id]),
        db.query(`SELECT * FROM petty_cash_audit_log WHERE request_id = $1 ORDER BY created_at`, [id]),
    ]);
    return {
        request,
        approvals: approvals.rows,
        disbursements: disbursements.rows,
        bills: bills.rows,
        settlements: settlements.rows,
        audit: audit.rows,
    };
}

export async function transitionPettyCashStatus(
    id: string, toStatus: PettyCashStatus, actor: { id: string; name: string },
    note?: string, extra?: { bill_due_on?: string | null },
): Promise<PettyCashRequest> {
    const cur = await db.query(`SELECT status FROM petty_cash_requests WHERE id = $1`, [id]);
    const from = cur.rows[0]?.status ?? null;
    const sets = [`status = $2`, `updated_at = now()`];
    const vals: any[] = [id, toStatus];
    if (extra && 'bill_due_on' in extra) { sets.push(`bill_due_on = $3`); vals.push(extra.bill_due_on); }
    const { rows } = await db.query(`UPDATE petty_cash_requests SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    await addPettyCashAudit(id, 'status_change', from, toStatus, actor, note);
    return num(rows[0]);
}

export async function addPettyCashApproval(requestId: string, data: {
    amount_approved: number;
    approval_channel: string;
    evidence_url?: string;
    remarks?: string;
    approved_by?: string | null;
    approved_by_name?: string;
    recorded_by: string;
    recorded_by_name: string;
}) {
    const { rows } = await db.query(
        `INSERT INTO petty_cash_approvals
            (request_id, approved_by, approved_by_name, approved_at, amount_approved,
             approval_channel, evidence_url, recorded_by, recorded_by_name, remarks)
         VALUES ($1,$2,$3,now(),$4,$5,$6,$7,$8,$9) RETURNING *`,
        [requestId, data.approved_by || null, data.approved_by_name || null, data.amount_approved,
         data.approval_channel, data.evidence_url || null, data.recorded_by, data.recorded_by_name, data.remarks || null],
    );
    return rows[0];
}

export async function addPettyCashDisbursement(requestId: string, data: {
    amount_paid: number;
    paid_on?: string;
    payment_mode: string;
    reference_no?: string;
    proof_url?: string;
    paid_by: string;
    paid_by_name: string;
}) {
    const { rows } = await db.query(
        `INSERT INTO petty_cash_disbursements
            (request_id, amount_paid, paid_on, payment_mode, reference_no, proof_url, paid_by, paid_by_name)
         VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8) RETURNING *`,
        [requestId, data.amount_paid, data.paid_on || null, data.payment_mode,
         data.reference_no || null, data.proof_url || null, data.paid_by, data.paid_by_name],
    );
    return rows[0];
}

export async function addPettyCashBill(requestId: string, data: {
    bill_no?: string; bill_date?: string; vendor?: string; bill_amount: number;
    file_url?: string; file_name?: string; source?: string; uploaded_by: string;
}) {
    const { rows } = await db.query(
        `INSERT INTO petty_cash_bills
            (request_id, bill_no, bill_date, vendor, bill_amount, file_url, file_name, source, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [requestId, data.bill_no || null, data.bill_date || null, data.vendor || null, data.bill_amount,
         data.file_url || null, data.file_name || null, data.source || 'UPLOAD', data.uploaded_by],
    );
    return rows[0];
}

export async function verifyPettyCashBill(billId: string, actor: { id: string; name: string }, status: 'VERIFIED' | 'REJECTED') {
    const { rows } = await db.query(
        `UPDATE petty_cash_bills SET status = $2, verified_by = $3, verified_by_name = $4, verified_on = now()
         WHERE id = $1 RETURNING *`,
        [billId, status, actor.id, actor.name],
    );
    return rows[0];
}

export async function addPettyCashSettlement(requestId: string, data: {
    spent_amount: number; balance_amount: number; direction: string;
    settled_on?: string; reference?: string; reason_code?: string;
    settled_by: string; settled_by_name: string;
}) {
    const { rows } = await db.query(
        `INSERT INTO petty_cash_settlements
            (request_id, spent_amount, balance_amount, direction, settled_on, reference, reason_code, settled_by, settled_by_name)
         VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8,$9) RETURNING *`,
        [requestId, data.spent_amount, data.balance_amount, data.direction, data.settled_on || null,
         data.reference || null, data.reason_code || null, data.settled_by, data.settled_by_name],
    );
    return rows[0];
}

export async function addPettyCashAudit(
    requestId: string, action: string, fromStatus: string | null, toStatus: string | null,
    actor: { id: string; name: string }, note?: string,
) {
    await db.query(
        `INSERT INTO petty_cash_audit_log (request_id, action, from_status, to_status, actor_id, actor_name, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [requestId, action, fromStatus, toStatus, actor.id, actor.name, note || null],
    );
}

// ── Eligibility register ─────────────────────────────────────────────────────
export async function listPettyCashEligibility(university_id?: string) {
    const where = university_id ? `WHERE (e.university_id = $1 OR e.university_id IS NULL)` : '';
    const { rows } = await db.query(
        `SELECT e.*, u.name AS user_name, u.email AS user_email, un.name AS university_name
           FROM petty_cash_eligibility e
           JOIN users u ON u.id = e.user_id
           LEFT JOIN universities un ON un.id = e.university_id
           ${where}
          ORDER BY e.is_active DESC, u.name`,
        university_id ? [university_id] : [],
    );
    return rows;
}

export async function getPettyCashEligibility(userId: string, universityId?: string) {
    const { rows } = await db.query(
        `SELECT * FROM petty_cash_eligibility
          WHERE user_id = $1 AND is_active = true
            AND (university_id = $2 OR university_id IS NULL)
          ORDER BY university_id NULLS LAST LIMIT 1`,
        [userId, universityId || null],
    );
    return rows[0] || null;
}

export async function upsertPettyCashEligibility(data: {
    user_id: string; university_id?: string | null; max_per_request: number; max_open_advance: number;
    effective_from?: string; effective_to?: string | null; granted_by: string; granted_by_name: string; is_active?: boolean;
}) {
    const { rows } = await db.query(
        `INSERT INTO petty_cash_eligibility
            (user_id, university_id, max_per_request, max_open_advance, effective_from, effective_to, granted_by, granted_by_name, is_active)
         VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,COALESCE($9,true))
         ON CONFLICT (user_id, university_id) DO UPDATE SET
            max_per_request = EXCLUDED.max_per_request,
            max_open_advance = EXCLUDED.max_open_advance,
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            is_active = EXCLUDED.is_active,
            granted_by = EXCLUDED.granted_by,
            granted_by_name = EXCLUDED.granted_by_name,
            updated_at = now()
         RETURNING *`,
        [data.user_id, data.university_id || null, data.max_per_request, data.max_open_advance,
         data.effective_from || null, data.effective_to || null, data.granted_by, data.granted_by_name, data.is_active],
    );
    return rows[0];
}

export async function revokePettyCashEligibility(id: string) {
    await db.query(`UPDATE petty_cash_eligibility SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
}

/** Sum of money currently disbursed-but-unsettled to a given user (open advance). */
export async function getOpenAdvanceForUser(userId: string): Promise<number> {
    const { rows } = await db.query(
        `SELECT COALESCE(SUM(d.amount_paid), 0) AS open
           FROM petty_cash_requests r
           JOIN petty_cash_disbursements d ON d.request_id = r.id
          WHERE r.requester_user_id = $1
            AND r.status IN ('DISBURSED','BILL_SUBMITTED','BILL_VERIFIED')`,
        [userId],
    );
    return Number(rows[0].open) || 0;
}

// ── Dashboard aggregates ─────────────────────────────────────────────────────
export async function getPettyCashDashboardStats(university_id?: string) {
    const w = university_id ? `WHERE r.university_id = $1` : '';
    const args = university_id ? [university_id] : [];
    const { rows } = await db.query(
        `SELECT
            COALESCE(SUM(CASE WHEN r.status IN ('DISBURSED','BILL_SUBMITTED','BILL_VERIFIED')
                THEN (SELECT COALESCE(SUM(amount_paid),0) FROM petty_cash_disbursements d WHERE d.request_id = r.id)
                ELSE 0 END), 0) AS outstanding_amount,
            COUNT(*) FILTER (WHERE r.status = 'SUBMITTED') AS awaiting_approval,
            COUNT(*) FILTER (WHERE r.status IN ('DISBURSED','BILL_SUBMITTED') AND r.bill_due_on IS NOT NULL AND r.bill_due_on < CURRENT_DATE) AS bills_overdue,
            COUNT(*) FILTER (WHERE r.status = 'APPROVED') AS awaiting_disbursement
         FROM petty_cash_requests r ${w}`,
        args,
    );
    // Median approval turnaround (hours) — submitted → approved
    const turn = await db.query(
        `SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (a.approved_at - r.created_at)) / 3600.0), 0) AS median_hours
           FROM petty_cash_requests r
           JOIN petty_cash_approvals a ON a.request_id = r.id AND a.approved_at IS NOT NULL
          ${university_id ? 'WHERE r.university_id = $1' : ''}`,
        args,
    );
    return {
        outstanding_amount: Number(rows[0].outstanding_amount) || 0,
        awaiting_approval: Number(rows[0].awaiting_approval) || 0,
        bills_overdue: Number(rows[0].bills_overdue) || 0,
        awaiting_disbursement: Number(rows[0].awaiting_disbursement) || 0,
        median_turnaround_hours: Math.round((Number(turn.rows[0].median_hours) || 0) * 10) / 10,
    };
}
