/**
 * Fee Collection — database schema and CRUD functions.
 *
 * Tracks per-student fee payments across multiple semesters/terms and batches.
 * Powers the /fee-collection page, the cases tab, daily collection log,
 * remarks with proof attachments, and rollups for reports.
 *
 * Imports from Google Sheets (`Userwise Data`, `Day_Wise_Payments`,
 * `Unpaid remarks`) via the import API; one student per `(period, zoho_user_id)`.
 */
import { db } from './client';

let tablesEnsured = false;

export type FeePaymentStatus = 'Fully Paid' | 'Partially Paid' | 'Yet To Pay';
export type FeeCaseTag =
    | 'loan' | 'dropout' | 'waiver' | 'scholar' | 'defer'
    | 'will_pay' | 'want_to_drop' | 'pending_payment'
    | 'day_wise_followup' | 'applied_for_loan' | 'other';

export async function ensureFeeTables() {
    if (tablesEnsured) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS fee_periods (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                name text NOT NULL,
                program text,
                term int NOT NULL CHECK (term BETWEEN 1 AND 8),
                academic_year text,
                batch_start_year int,
                batch_end_year int,
                status text NOT NULL DEFAULT 'active',
                created_by uuid REFERENCES users(id),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS batch_start_year int;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS batch_end_year int;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS sheet_id text;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS sheet_tabs_config jsonb;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes int NOT NULL DEFAULT 30;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS last_sync_error text;
            ALTER TABLE fee_periods ADD COLUMN IF NOT EXISTS last_sync_summary jsonb;

            CREATE TABLE IF NOT EXISTS fee_university_meta (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id uuid NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                fee_per_student numeric,
                strength int,
                registration_date date,
                prev_sem_end_date text,
                collection_start_date text,
                collection_end_date text,
                next_sem_start_date text,
                meta_remarks text,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (period_id, university_id)
            );

            CREATE TABLE IF NOT EXISTS fee_student_payments (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id uuid NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                student_id uuid REFERENCES students(id) ON DELETE SET NULL,
                zoho_user_id text,
                student_name text,
                payable numeric NOT NULL DEFAULT 0,
                paid numeric NOT NULL DEFAULT 0,
                pending numeric GENERATED ALWAYS AS (GREATEST(payable - paid, 0)) STORED,
                status text NOT NULL DEFAULT 'Yet To Pay',
                success_coach_name text,
                active_status text,
                payment_method text,
                last_payment_date date,
                imported_at timestamptz,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (period_id, zoho_user_id)
            );

            CREATE TABLE IF NOT EXISTS fee_remarks (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                student_payment_id uuid NOT NULL REFERENCES fee_student_payments(id) ON DELETE CASCADE,
                author_id uuid REFERENCES users(id) ON DELETE SET NULL,
                author_name text NOT NULL,
                role text NOT NULL DEFAULT 'Other',
                case_type text,
                text text NOT NULL,
                source text NOT NULL DEFAULT 'manual',
                created_at timestamptz NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS fee_remark_attachments (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                remark_id uuid NOT NULL REFERENCES fee_remarks(id) ON DELETE CASCADE,
                file_name text NOT NULL,
                file_url text NOT NULL,
                storage_path text,
                size_bytes int NOT NULL DEFAULT 0,
                mime_type text,
                uploaded_by uuid REFERENCES users(id),
                uploaded_at timestamptz NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS fee_student_tags (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                student_payment_id uuid NOT NULL REFERENCES fee_student_payments(id) ON DELETE CASCADE,
                tag text NOT NULL,
                added_by uuid REFERENCES users(id) ON DELETE SET NULL,
                added_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (student_payment_id, tag)
            );

            CREATE TABLE IF NOT EXISTS fee_daily_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id uuid NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                date date NOT NULL,
                amount numeric NOT NULL DEFAULT 0,
                students_count int NOT NULL DEFAULT 0,
                notes text,
                created_by uuid REFERENCES users(id) ON DELETE SET NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                locked_at timestamptz,
                UNIQUE (period_id, university_id, date)
            );

            CREATE TABLE IF NOT EXISTS fee_payment_transactions (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id uuid NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
                student_payment_id uuid REFERENCES fee_student_payments(id) ON DELETE SET NULL,
                zoho_user_id text NOT NULL,
                university_id uuid REFERENCES universities(id),
                payment_date date NOT NULL,
                amount numeric,
                source text,
                imported_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (zoho_user_id, payment_date, period_id)
            );

            CREATE TABLE IF NOT EXISTS fee_doc_requests (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id uuid NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
                student_payment_id uuid NOT NULL REFERENCES fee_student_payments(id) ON DELETE CASCADE,
                doc_type text NOT NULL DEFAULT 'billing_receipt',
                message text,
                upload_form_url text,
                email_to text,
                email_subject text,
                ack_token text NOT NULL UNIQUE,
                sent_at timestamptz NOT NULL DEFAULT now(),
                opened_at timestamptz,
                acknowledged_at timestamptz,
                uploaded_at timestamptz,
                ack_ip text,
                ack_user_agent text,
                sent_by uuid REFERENCES users(id),
                status text NOT NULL DEFAULT 'sent',
                batch_send_id text
            );
            CREATE INDEX IF NOT EXISTS idx_fee_doc_requests_period ON fee_doc_requests(period_id, status);
            CREATE INDEX IF NOT EXISTS idx_fee_doc_requests_student ON fee_doc_requests(student_payment_id);
            CREATE INDEX IF NOT EXISTS idx_fee_doc_requests_token ON fee_doc_requests(ack_token);
            CREATE INDEX IF NOT EXISTS idx_fee_doc_requests_batch ON fee_doc_requests(batch_send_id);

            CREATE INDEX IF NOT EXISTS idx_fee_student_payments_period_uni ON fee_student_payments(period_id, university_id);
            CREATE INDEX IF NOT EXISTS idx_fee_student_payments_status ON fee_student_payments(status);
            CREATE INDEX IF NOT EXISTS idx_fee_student_payments_zoho ON fee_student_payments(zoho_user_id);
            CREATE INDEX IF NOT EXISTS idx_fee_remarks_student_created ON fee_remarks(student_payment_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_fee_tags_tag ON fee_student_tags(tag);
            CREATE INDEX IF NOT EXISTS idx_fee_daily_log_uni_date ON fee_daily_log(university_id, date DESC);
            CREATE INDEX IF NOT EXISTS idx_fee_tx_date_uni ON fee_payment_transactions(payment_date DESC, university_id);
        `);
        tablesEnsured = true;
    } catch (e: any) {
        console.warn('[FEE_COLLECTION] ensureFeeTables warning:', e.message);
        tablesEnsured = true;
    }
}

// ─── Periods ────────────────────────────────────────────────────────

export async function getFeePeriods() {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT id, name, program, term, academic_year, status, created_at,
                batch_start_year, batch_end_year,
                sheet_id, sheet_tabs_config,
                auto_sync_enabled, auto_sync_interval_minutes,
                last_synced_at, last_sync_error, last_sync_summary
         FROM fee_periods
         ORDER BY academic_year DESC NULLS LAST, term DESC, created_at DESC`
    );
    return res.rows;
}

export async function getActiveFeePeriod() {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT * FROM fee_periods WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );
    return res.rows[0] || null;
}

export async function createFeePeriod(data: {
    name: string; program?: string; term: number; academic_year?: string;
    batch_start_year?: number; batch_end_year?: number; created_by?: string;
    sheet_id?: string; sheet_tabs_config?: any;
    auto_sync_enabled?: boolean; auto_sync_interval_minutes?: number;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_periods (name, program, term, academic_year, batch_start_year, batch_end_year, created_by,
            sheet_id, sheet_tabs_config, auto_sync_enabled, auto_sync_interval_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [data.name, data.program || null, data.term, data.academic_year || null,
         data.batch_start_year || null, data.batch_end_year || null, data.created_by || null,
         data.sheet_id || null, data.sheet_tabs_config ? JSON.stringify(data.sheet_tabs_config) : null,
         data.auto_sync_enabled || false, data.auto_sync_interval_minutes || 30]
    );
    return res.rows[0];
}

export async function updateFeePeriodSync(id: string, updates: {
    sheet_id?: string | null;
    sheet_tabs_config?: any;
    auto_sync_enabled?: boolean;
    auto_sync_interval_minutes?: number;
}) {
    await ensureFeeTables();
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (updates.sheet_id !== undefined) { fields.push(`sheet_id = $${i++}`); params.push(updates.sheet_id); }
    if (updates.sheet_tabs_config !== undefined) {
        fields.push(`sheet_tabs_config = $${i++}`);
        params.push(updates.sheet_tabs_config ? JSON.stringify(updates.sheet_tabs_config) : null);
    }
    if (updates.auto_sync_enabled !== undefined) { fields.push(`auto_sync_enabled = $${i++}`); params.push(updates.auto_sync_enabled); }
    if (updates.auto_sync_interval_minutes !== undefined) { fields.push(`auto_sync_interval_minutes = $${i++}`); params.push(updates.auto_sync_interval_minutes); }
    if (!fields.length) return null;
    params.push(id);
    const res = await db.query(
        `UPDATE fee_periods SET ${fields.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
        params
    );
    return res.rows[0];
}

export async function recordSyncResult(periodId: string, summary: any, error?: string | null) {
    await ensureFeeTables();
    // Only bump last_synced_at on a real success (no error AND we got a summary
    // with something imported). Failures still update last_sync_error so the
    // banner shows, but the "Last synced X ago" timestamp keeps reflecting the
    // last actually-successful run.
    if (!error && summary) {
        await db.query(
            `UPDATE fee_periods
                SET last_synced_at = now(),
                    last_sync_summary = $2,
                    last_sync_error = NULL
              WHERE id = $1`,
            [periodId, JSON.stringify(summary)]
        );
    } else {
        await db.query(
            `UPDATE fee_periods SET last_sync_error = $2 WHERE id = $1`,
            [periodId, error || 'unknown error']
        );
    }
}

/**
 * Find all periods due for an auto-sync run.
 * Returns periods where auto_sync_enabled=true AND
 * (last_synced_at is null OR now - last_synced_at >= interval minutes).
 */
export async function getPeriodsDueForSync() {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT * FROM fee_periods
         WHERE auto_sync_enabled = true
           AND sheet_id IS NOT NULL
           AND (last_synced_at IS NULL OR now() - last_synced_at >= (auto_sync_interval_minutes || ' minutes')::interval)
         ORDER BY last_synced_at NULLS FIRST`
    );
    return res.rows;
}

/**
 * Aggregate every payment transaction in a period into the per-day-per-university
 * collection log. Called at the end of a sync so the Daily Report tab has data
 * without anyone manually adding entries.
 *
 * Strategy:
 *   - DELETE all existing auto-generated rows for the period (rows we created
 *     before this run — identified by notes='auto: aggregated from transactions')
 *   - INSERT one row per (university_id, date) with SUM(amount) + COUNT(*) students
 *   - Manual entries (with different notes) are left untouched
 */
export async function aggregateTransactionsToDailyLog(periodId: string): Promise<number> {
    await ensureFeeTables();
    await db.query(
        `DELETE FROM fee_daily_log
         WHERE period_id = $1 AND notes = 'auto: aggregated from transactions'`,
        [periodId]
    );
    const res = await db.query(
        `INSERT INTO fee_daily_log (period_id, university_id, date, amount, students_count, notes, created_by)
         SELECT
            t.period_id,
            t.university_id,
            t.payment_date,
            COALESCE(SUM(t.amount), 0),
            COUNT(DISTINCT t.zoho_user_id),
            'auto: aggregated from transactions',
            NULL
         FROM fee_payment_transactions t
         WHERE t.period_id = $1 AND t.university_id IS NOT NULL
         GROUP BY t.period_id, t.university_id, t.payment_date
         ON CONFLICT (period_id, university_id, date) DO UPDATE SET
            amount = EXCLUDED.amount,
            students_count = EXCLUDED.students_count,
            notes = EXCLUDED.notes
         RETURNING 1`,
        [periodId]
    );
    return res.rowCount || 0;
}

/**
 * Merge two universities — moves all fee data from source → target, then
 * deletes the source row. Used to clean up duplicates created by name
 * variants in the source sheet (e.g. "Mallareddy" + "MRV").
 *
 * Returns counts of rows moved per table. Wrapped in a transaction; either
 * the whole merge succeeds or nothing changes.
 */
export async function mergeUniversities(sourceId: string, targetId: string): Promise<{
    student_payments: number;
    transactions: number;
    daily_log: number;
    summary_deleted: number;
    meta_moved: number;
}> {
    if (sourceId === targetId) throw new Error('Source and target must differ');
    await ensureFeeTables();

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Student payments — uniqueness is (period_id, zoho_user_id), independent of uni
        const sp = await client.query(
            `UPDATE fee_student_payments SET university_id = $1 WHERE university_id = $2`,
            [targetId, sourceId]
        );

        // 2. Transactions — uniqueness is (zoho_user_id, payment_date, period_id)
        const tx = await client.query(
            `UPDATE fee_payment_transactions SET university_id = $1 WHERE university_id = $2`,
            [targetId, sourceId]
        );

        // 3. Daily log — UNIQUE (period_id, university_id, date). Merge by summing.
        const dl = await client.query(
            `INSERT INTO fee_daily_log (period_id, university_id, date, amount, students_count, notes, created_by)
             SELECT period_id, $1::uuid, date, amount, students_count, notes, created_by
             FROM fee_daily_log WHERE university_id = $2
             ON CONFLICT (period_id, university_id, date) DO UPDATE SET
                amount = fee_daily_log.amount + EXCLUDED.amount,
                students_count = fee_daily_log.students_count + EXCLUDED.students_count
             RETURNING 1`,
            [targetId, sourceId]
        );
        await client.query(`DELETE FROM fee_daily_log WHERE university_id = $1`, [sourceId]);

        // 4. University summary — UNIQUE (period_id, university_id). Prefer target's row, drop source.
        const sum = await client.query(
            `DELETE FROM fee_university_summary WHERE university_id = $1`,
            [sourceId]
        );

        // 5. Per-uni meta — move (no conflict expected; one row per (period, uni))
        let metaMoved = 0;
        try {
            const meta = await client.query(
                `UPDATE fee_university_meta SET university_id = $1 WHERE university_id = $2`,
                [targetId, sourceId]
            );
            metaMoved = meta.rowCount || 0;
        } catch {
            // table may not exist in older DBs — ignore
        }

        // 6. Finally delete the source university row itself
        await client.query(`DELETE FROM universities WHERE id = $1`, [sourceId]);

        await client.query('COMMIT');

        return {
            student_payments: sp.rowCount || 0,
            transactions: tx.rowCount || 0,
            daily_log: dl.rowCount || 0,
            summary_deleted: sum.rowCount || 0,
            meta_moved: metaMoved,
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── Doc Requests / Acknowledgments ────────────────────────────────

import * as crypto from 'crypto';

export type DocRequestStatus = 'sent' | 'opened' | 'acknowledged' | 'uploaded';

export async function findStudentsWithoutDocs(periodId: string, opts: {
    university_id?: string;
    only_unpaid?: boolean;
} = {}) {
    await ensureFeeTables();
    const conditions: string[] = ['sp.period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;

    // "No docs" = no remarks have any attachments
    conditions.push(`NOT EXISTS (
        SELECT 1 FROM fee_remarks r
        JOIN fee_remark_attachments a ON a.remark_id = r.id
        WHERE r.student_payment_id = sp.id
    )`);

    if (opts.university_id) {
        conditions.push(`sp.university_id = $${i++}`);
        params.push(opts.university_id);
    }
    if (opts.only_unpaid) {
        // "Unpaid/partial" = actually owes money. Status alone is unreliable
        // because per-uni tabs without a payable column default to "Yet To Pay"
        // with payable=0 — those students don't really owe anything.
        conditions.push(`sp.status IN ('Yet To Pay', 'Partially Paid') AND sp.pending_amount > 0`);
    }

    const res = await db.query(
        `SELECT sp.*, COALESCE(u.short_name, u.name) AS university_name
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY sp.university_id, sp.student_name`,
        params
    );
    return res.rows;
}

export async function createDocRequests(data: {
    period_id: string;
    student_payment_ids: string[];
    doc_type: string;
    message: string;
    upload_form_url?: string;
    email_subject: string;
    sent_by: string;
    batch_send_id?: string;
}) {
    await ensureFeeTables();
    const batchId = data.batch_send_id || crypto.randomBytes(8).toString('hex');
    const inserted: any[] = [];
    for (const spId of data.student_payment_ids) {
        const token = crypto.randomBytes(24).toString('hex');
        const res = await db.query(
            `INSERT INTO fee_doc_requests
                (period_id, student_payment_id, doc_type, message, upload_form_url,
                 email_subject, ack_token, sent_by, batch_send_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent')
             RETURNING *`,
            [data.period_id, spId, data.doc_type, data.message,
             data.upload_form_url || null, data.email_subject, token,
             data.sent_by, batchId]
        );
        inserted.push(res.rows[0]);
    }
    return { batch_id: batchId, requests: inserted };
}

export async function getDocRequests(periodId: string, filters: { status?: string; batch_send_id?: string } = {}) {
    await ensureFeeTables();
    const conditions: string[] = ['dr.period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;
    if (filters.status) { conditions.push(`dr.status = $${i++}`); params.push(filters.status); }
    if (filters.batch_send_id) { conditions.push(`dr.batch_send_id = $${i++}`); params.push(filters.batch_send_id); }
    const res = await db.query(
        `SELECT dr.*, sp.student_name, sp.zoho_user_id, COALESCE(u.short_name, u.name) AS university_name
         FROM fee_doc_requests dr
         JOIN fee_student_payments sp ON sp.id = dr.student_payment_id
         JOIN universities u ON u.id = sp.university_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY dr.sent_at DESC`,
        params
    );
    return res.rows;
}

export async function getDocRequestByToken(token: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT dr.*, sp.student_name, sp.zoho_user_id, sp.payable, sp.paid, sp.pending,
                COALESCE(u.short_name, u.name) AS university_name,
                p.name AS period_name
         FROM fee_doc_requests dr
         JOIN fee_student_payments sp ON sp.id = dr.student_payment_id
         JOIN universities u ON u.id = sp.university_id
         JOIN fee_periods p ON p.id = dr.period_id
         WHERE dr.ack_token = $1`,
        [token]
    );
    return res.rows[0] || null;
}

export async function markDocRequestOpened(token: string, meta: { ip?: string; ua?: string }) {
    await ensureFeeTables();
    await db.query(
        `UPDATE fee_doc_requests
         SET opened_at = COALESCE(opened_at, now()),
             ack_ip = COALESCE(ack_ip, $2),
             ack_user_agent = COALESCE(ack_user_agent, $3),
             status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END
         WHERE ack_token = $1`,
        [token, meta.ip || null, meta.ua || null]
    );
}

export async function acknowledgeDocRequest(token: string, meta: { ip?: string; ua?: string }) {
    await ensureFeeTables();
    const res = await db.query(
        `UPDATE fee_doc_requests
         SET acknowledged_at = COALESCE(acknowledged_at, now()),
             ack_ip = COALESCE(ack_ip, $2),
             ack_user_agent = COALESCE(ack_user_agent, $3),
             status = CASE WHEN status IN ('sent', 'opened') THEN 'acknowledged' ELSE status END
         WHERE ack_token = $1
         RETURNING *`,
        [token, meta.ip || null, meta.ua || null]
    );
    return res.rows[0];
}

export async function getDocRequestStats(periodId: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT
            COUNT(*)::int AS total_sent,
            COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
            COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int AS acknowledged,
            COUNT(*) FILTER (WHERE uploaded_at IS NOT NULL)::int AS uploaded
         FROM fee_doc_requests WHERE period_id = $1`,
        [periodId]
    );
    return res.rows[0];
}

// ─── University Rollups (computed live from student payments) ───────

export async function getFeeUniversityRollup(periodId: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT
            u.id AS university_id,
            COALESCE(u.short_name, u.name) AS university_name,
            COUNT(sp.id)::int AS strength,
            COUNT(sp.id) FILTER (WHERE sp.status = 'Fully Paid')::int AS fully_paid,
            COUNT(sp.id) FILTER (WHERE sp.status = 'Partially Paid')::int AS partial_paid,
            COUNT(sp.id) FILTER (WHERE sp.status = 'Yet To Pay')::int AS not_paid,
            COALESCE(SUM(sp.payable), 0)::numeric AS payable,
            COALESCE(SUM(sp.paid), 0)::numeric AS paid,
            COALESCE(SUM(sp.pending), 0)::numeric AS pending,
            CASE WHEN SUM(sp.payable) > 0
                THEN ROUND((SUM(sp.paid)::numeric / SUM(sp.payable)::numeric) * 100, 2)
                ELSE 0 END AS collection_efficiency,
            CASE WHEN COUNT(sp.id) > 0
                THEN ROUND((COUNT(sp.id) FILTER (WHERE sp.status = 'Fully Paid')::numeric / COUNT(sp.id)::numeric) * 100, 2)
                ELSE 0 END AS fully_paid_pct,
            CASE WHEN COUNT(sp.id) > 0
                THEN ROUND((COUNT(sp.id) FILTER (WHERE sp.status = 'Yet To Pay')::numeric / COUNT(sp.id)::numeric) * 100, 2)
                ELSE 0 END AS not_paid_pct,
            m.fee_per_student,
            m.registration_date,
            m.collection_start_date,
            m.collection_end_date,
            m.next_sem_start_date,
            m.prev_sem_end_date,
            m.meta_remarks
         FROM fee_student_payments sp
         RIGHT JOIN universities u ON u.id = sp.university_id AND sp.period_id = $1
         LEFT JOIN fee_university_meta m ON m.university_id = u.id AND m.period_id = $1
         WHERE u.is_team IS NOT TRUE
         GROUP BY u.id, u.short_name, u.name, m.fee_per_student, m.registration_date,
                  m.collection_start_date, m.collection_end_date, m.next_sem_start_date,
                  m.prev_sem_end_date, m.meta_remarks
         HAVING COUNT(sp.id) > 0
         ORDER BY university_name`,
        [periodId]
    );
    return res.rows;
}

export async function getFeeOverallSummary(periodId: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT
            COUNT(*)::int AS strength,
            COUNT(*) FILTER (WHERE status = 'Fully Paid')::int AS fully_paid,
            COUNT(*) FILTER (WHERE status = 'Partially Paid')::int AS partial_paid,
            COUNT(*) FILTER (WHERE status = 'Yet To Pay')::int AS not_paid,
            COALESCE(SUM(payable), 0)::numeric AS total_payable,
            COALESCE(SUM(paid), 0)::numeric AS total_paid,
            COALESCE(SUM(pending), 0)::numeric AS total_pending,
            COUNT(DISTINCT university_id)::int AS universities,
            CASE WHEN SUM(payable) > 0
                THEN ROUND((SUM(paid) / SUM(payable)) * 100, 2)
                ELSE 0 END AS avg_efficiency
         FROM fee_student_payments WHERE period_id = $1`,
        [periodId]
    );
    return res.rows[0];
}

// ─── University meta (dates / fee amount) ───────────────────────────

export async function upsertFeeUniversityMeta(data: {
    period_id: string; university_id: string;
    fee_per_student?: number; strength?: number;
    registration_date?: string; prev_sem_end_date?: string;
    collection_start_date?: string; collection_end_date?: string;
    next_sem_start_date?: string; meta_remarks?: string;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_university_meta (period_id, university_id, fee_per_student, strength,
            registration_date, prev_sem_end_date, collection_start_date, collection_end_date,
            next_sem_start_date, meta_remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (period_id, university_id) DO UPDATE SET
            fee_per_student = COALESCE(EXCLUDED.fee_per_student, fee_university_meta.fee_per_student),
            strength = COALESCE(EXCLUDED.strength, fee_university_meta.strength),
            registration_date = COALESCE(EXCLUDED.registration_date, fee_university_meta.registration_date),
            prev_sem_end_date = COALESCE(EXCLUDED.prev_sem_end_date, fee_university_meta.prev_sem_end_date),
            collection_start_date = COALESCE(EXCLUDED.collection_start_date, fee_university_meta.collection_start_date),
            collection_end_date = COALESCE(EXCLUDED.collection_end_date, fee_university_meta.collection_end_date),
            next_sem_start_date = COALESCE(EXCLUDED.next_sem_start_date, fee_university_meta.next_sem_start_date),
            meta_remarks = COALESCE(EXCLUDED.meta_remarks, fee_university_meta.meta_remarks),
            updated_at = now()
         RETURNING *`,
        [data.period_id, data.university_id, data.fee_per_student || null, data.strength || null,
         data.registration_date || null, data.prev_sem_end_date || null,
         data.collection_start_date || null, data.collection_end_date || null,
         data.next_sem_start_date || null, data.meta_remarks || null]
    );
    return res.rows[0];
}

// ─── Student Payments ───────────────────────────────────────────────

export async function getFeeStudents(filters: {
    period_id: string; university_id?: string; status?: string;
    tag?: string; search?: string; limit?: number; offset?: number;
}) {
    await ensureFeeTables();
    const conditions: string[] = ['sp.period_id = $1'];
    const params: any[] = [filters.period_id];
    let i = 2;

    if (filters.university_id) {
        conditions.push(`sp.university_id = $${i++}`);
        params.push(filters.university_id);
    }
    if (filters.status) {
        conditions.push(`sp.status = $${i++}`);
        params.push(filters.status);
    }
    if (filters.tag) {
        conditions.push(`EXISTS (SELECT 1 FROM fee_student_tags WHERE student_payment_id = sp.id AND tag = $${i++})`);
        params.push(filters.tag);
    }
    if (filters.search) {
        conditions.push(`(LOWER(sp.student_name) LIKE $${i} OR LOWER(sp.zoho_user_id) LIKE $${i})`);
        params.push(`%${filters.search.toLowerCase()}%`);
        i++;
    }

    let limitClause = '';
    if (filters.limit) {
        limitClause += ` LIMIT $${i++}`;
        params.push(filters.limit);
    }
    if (filters.offset) {
        limitClause += ` OFFSET $${i++}`;
        params.push(filters.offset);
    }

    const where = conditions.join(' AND ');
    const res = await db.query(
        `SELECT sp.*, COALESCE(u.short_name, u.name) AS university_name,
            (SELECT COUNT(*)::int FROM fee_remarks WHERE student_payment_id = sp.id) AS remarks_count,
            (SELECT array_agg(tag) FROM fee_student_tags WHERE student_payment_id = sp.id) AS tags
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE ${where}
         ORDER BY sp.status DESC, sp.pending DESC, sp.student_name${limitClause}`,
        params
    );
    const countRes = await db.query(
        `SELECT COUNT(*)::int AS total FROM fee_student_payments sp WHERE ${where}`,
        params.slice(0, i - 1 - (filters.limit ? 1 : 0) - (filters.offset ? 1 : 0))
    );
    return { rows: res.rows, total: countRes.rows[0].total };
}

export async function getFeeStudentById(id: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT sp.*, COALESCE(u.short_name, u.name) AS university_name,
            (SELECT array_agg(tag) FROM fee_student_tags WHERE student_payment_id = sp.id) AS tags
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE sp.id = $1`,
        [id]
    );
    return res.rows[0] || null;
}

/**
 * Bulk upsert — much faster than calling upsertFeeStudentPayment N times.
 * Uses a single multi-row INSERT...ON CONFLICT statement.
 */
export async function bulkUpsertFeeStudentPayments(periodId: string, rows: Array<{
    university_id: string;
    zoho_user_id: string;
    student_name?: string;
    payable: number;
    paid: number;
    status: string;
    success_coach_name?: string;
    active_status?: string;
    payment_method?: string;
}>) {
    await ensureFeeTables();
    if (!rows.length) return 0;

    // Dedupe by zoho_user_id — Postgres ON CONFLICT can't update the same
    // row twice in one statement. If a student appears in multiple per-uni
    // tabs or duplicated within one tab, keep the latest occurrence.
    const seen = new Map<string, typeof rows[0]>();
    for (const r of rows) {
        if (!r.zoho_user_id) continue;
        seen.set(r.zoho_user_id, r);
    }
    const deduped = Array.from(seen.values());

    const CHUNK = 200;
    let total = 0;
    for (let i = 0; i < deduped.length; i += CHUNK) {
        const chunk = deduped.slice(i, i + CHUNK);
        const params: any[] = [periodId];
        const valueRows: string[] = [];
        let p = 2;
        for (const r of chunk) {
            valueRows.push(`($1, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, now())`);
            params.push(
                r.university_id, r.zoho_user_id, r.student_name || null,
                r.payable, r.paid, r.status,
                r.success_coach_name || null, r.active_status || null, r.payment_method || null
            );
        }
        const res = await db.query(
            `INSERT INTO fee_student_payments
                (period_id, university_id, zoho_user_id, student_name, payable, paid, status,
                 success_coach_name, active_status, payment_method, imported_at)
             VALUES ${valueRows.join(', ')}
             ON CONFLICT (period_id, zoho_user_id) DO UPDATE SET
                university_id = EXCLUDED.university_id,
                student_name = COALESCE(EXCLUDED.student_name, fee_student_payments.student_name),
                payable = EXCLUDED.payable,
                paid = EXCLUDED.paid,
                status = EXCLUDED.status,
                success_coach_name = COALESCE(EXCLUDED.success_coach_name, fee_student_payments.success_coach_name),
                active_status = COALESCE(EXCLUDED.active_status, fee_student_payments.active_status),
                payment_method = COALESCE(EXCLUDED.payment_method, fee_student_payments.payment_method),
                imported_at = now(),
                updated_at = now()`,
            params
        );
        total += res.rowCount || chunk.length;
    }
    return total;
}

export async function upsertFeeStudentPayment(data: {
    period_id: string; university_id: string;
    zoho_user_id: string; student_name?: string;
    payable: number; paid: number; status: string;
    success_coach_name?: string; active_status?: string;
    payment_method?: string; last_payment_date?: string;
    student_id?: string | null;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_student_payments (period_id, university_id, student_id, zoho_user_id,
            student_name, payable, paid, status, success_coach_name, active_status,
            payment_method, last_payment_date, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
         ON CONFLICT (period_id, zoho_user_id) DO UPDATE SET
            university_id = EXCLUDED.university_id,
            student_id = COALESCE(EXCLUDED.student_id, fee_student_payments.student_id),
            student_name = COALESCE(EXCLUDED.student_name, fee_student_payments.student_name),
            payable = EXCLUDED.payable,
            paid = EXCLUDED.paid,
            status = EXCLUDED.status,
            success_coach_name = COALESCE(EXCLUDED.success_coach_name, fee_student_payments.success_coach_name),
            active_status = COALESCE(EXCLUDED.active_status, fee_student_payments.active_status),
            payment_method = COALESCE(EXCLUDED.payment_method, fee_student_payments.payment_method),
            last_payment_date = COALESCE(EXCLUDED.last_payment_date, fee_student_payments.last_payment_date),
            imported_at = now(),
            updated_at = now()
         RETURNING *`,
        [data.period_id, data.university_id, data.student_id || null, data.zoho_user_id,
         data.student_name || null, data.payable, data.paid, data.status,
         data.success_coach_name || null, data.active_status || null,
         data.payment_method || null, data.last_payment_date || null]
    );
    return res.rows[0];
}

// ─── Remarks ────────────────────────────────────────────────────────

export async function getFeeRemarks(studentPaymentId: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT r.*,
            COALESCE(
                json_agg(
                    json_build_object('id', a.id, 'file_name', a.file_name, 'file_url', a.file_url,
                                      'size_bytes', a.size_bytes, 'mime_type', a.mime_type)
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
            ) AS attachments
         FROM fee_remarks r
         LEFT JOIN fee_remark_attachments a ON a.remark_id = r.id
         WHERE r.student_payment_id = $1
         GROUP BY r.id
         ORDER BY r.created_at DESC`,
        [studentPaymentId]
    );
    return res.rows;
}

export async function getAllFeeRemarks(periodId: string, filters: { role?: string; case_type?: string; search?: string } = {}) {
    await ensureFeeTables();
    const conditions: string[] = ['sp.period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;
    if (filters.role) { conditions.push(`r.role = $${i++}`); params.push(filters.role); }
    if (filters.case_type) { conditions.push(`r.case_type = $${i++}`); params.push(filters.case_type); }
    if (filters.search) {
        conditions.push(`(LOWER(r.text) LIKE $${i} OR LOWER(sp.student_name) LIKE $${i} OR LOWER(r.author_name) LIKE $${i})`);
        params.push(`%${filters.search.toLowerCase()}%`); i++;
    }
    const res = await db.query(
        `SELECT r.*, sp.student_name, sp.zoho_user_id, COALESCE(u.short_name, u.name) AS university_name, sp.id AS student_payment_id,
            (SELECT COUNT(*)::int FROM fee_remark_attachments WHERE remark_id = r.id) AS attachment_count
         FROM fee_remarks r
         JOIN fee_student_payments sp ON sp.id = r.student_payment_id
         JOIN universities u ON u.id = sp.university_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY r.created_at DESC
         LIMIT 200`,
        params
    );
    return res.rows;
}

export async function createFeeRemark(data: {
    student_payment_id: string; author_id?: string; author_name: string;
    role: string; case_type?: string; text: string; source?: string;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_remarks (student_payment_id, author_id, author_name, role, case_type, text, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.student_payment_id, data.author_id || null, data.author_name,
         data.role, data.case_type || null, data.text, data.source || 'manual']
    );
    return res.rows[0];
}

export async function deleteFeeRemark(id: string) {
    await ensureFeeTables();
    await db.query(`DELETE FROM fee_remarks WHERE id = $1`, [id]);
    return { success: true };
}

export async function addFeeRemarkAttachment(data: {
    remark_id: string; file_name: string; file_url: string; storage_path?: string;
    size_bytes: number; mime_type?: string; uploaded_by?: string;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_remark_attachments (remark_id, file_name, file_url, storage_path, size_bytes, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.remark_id, data.file_name, data.file_url, data.storage_path || null,
         data.size_bytes, data.mime_type || null, data.uploaded_by || null]
    );
    return res.rows[0];
}

// ─── Tags ───────────────────────────────────────────────────────────

export async function toggleFeeStudentTag(studentPaymentId: string, tag: string, addedBy?: string) {
    await ensureFeeTables();
    const exists = await db.query(
        `SELECT id FROM fee_student_tags WHERE student_payment_id = $1 AND tag = $2`,
        [studentPaymentId, tag]
    );
    if (exists.rows.length > 0) {
        await db.query(`DELETE FROM fee_student_tags WHERE id = $1`, [exists.rows[0].id]);
        return { added: false };
    }
    await db.query(
        `INSERT INTO fee_student_tags (student_payment_id, tag, added_by) VALUES ($1, $2, $3)`,
        [studentPaymentId, tag, addedBy || null]
    );
    return { added: true };
}

export async function getFeeStudentTags(studentPaymentId: string) {
    await ensureFeeTables();
    const res = await db.query(
        `SELECT tag FROM fee_student_tags WHERE student_payment_id = $1`,
        [studentPaymentId]
    );
    return res.rows.map((r: any) => r.tag);
}

export async function getTaggedStudents(periodId: string, tag?: string, search?: string) {
    await ensureFeeTables();
    const conditions: string[] = ['sp.period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;
    if (tag) {
        conditions.push(`EXISTS (SELECT 1 FROM fee_student_tags WHERE student_payment_id = sp.id AND tag = $${i++})`);
        params.push(tag);
    } else {
        conditions.push(`EXISTS (SELECT 1 FROM fee_student_tags WHERE student_payment_id = sp.id)`);
    }
    if (search) {
        conditions.push(`(LOWER(sp.student_name) LIKE $${i} OR LOWER(sp.zoho_user_id) LIKE $${i})`);
        params.push(`%${search.toLowerCase()}%`); i++;
    }
    const res = await db.query(
        `SELECT sp.*, COALESCE(u.short_name, u.name) AS university_name,
            (SELECT array_agg(t.tag) FROM fee_student_tags t WHERE t.student_payment_id = sp.id) AS tags,
            (SELECT COUNT(*)::int FROM fee_remarks WHERE student_payment_id = sp.id) AS remarks_count
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY sp.student_name`,
        params
    );
    return res.rows;
}

// ─── Daily Log (with 8 PM IST lock) ─────────────────────────────────

export function isPast8PmIST(): boolean {
    const now = new Date();
    const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
    return istHour >= 20;
}

export function todayInIST(): string {
    const now = new Date();
    const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
    return new Date(istMs).toISOString().split('T')[0];
}

export async function getFeeDailyLog(periodId: string, filters: { university_id?: string; month?: number; year?: number } = {}) {
    await ensureFeeTables();
    const conditions: string[] = ['period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;
    if (filters.university_id) { conditions.push(`university_id = $${i++}`); params.push(filters.university_id); }
    if (filters.month && filters.year) {
        conditions.push(`EXTRACT(MONTH FROM date) = $${i++} AND EXTRACT(YEAR FROM date) = $${i++}`);
        params.push(filters.month, filters.year);
    }
    const res = await db.query(
        `SELECT dl.*, COALESCE(u.short_name, u.name) AS university_name
         FROM fee_daily_log dl
         JOIN universities u ON u.id = dl.university_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY dl.date DESC, university_name`,
        params
    );
    return res.rows;
}

export async function createFeeDailyEntry(data: {
    period_id: string; university_id: string; date: string;
    amount: number; students_count: number; notes?: string; created_by?: string;
}, allowLocked = false) {
    await ensureFeeTables();
    // 8 PM IST lock — reject same-day edits after 8 PM unless caller bypasses (admin)
    if (!allowLocked && data.date === todayInIST() && isPast8PmIST()) {
        throw new Error('Data is locked after 8 PM IST. Please add this entry tomorrow or ask an admin.');
    }
    if (!allowLocked) {
        const existing = await db.query(
            `SELECT locked_at FROM fee_daily_log WHERE period_id = $1 AND university_id = $2 AND date = $3`,
            [data.period_id, data.university_id, data.date]
        );
        if (existing.rows.length > 0 && existing.rows[0].locked_at) {
            throw new Error('This entry is locked. Ask an admin to unlock.');
        }
    }
    const res = await db.query(
        `INSERT INTO fee_daily_log (period_id, university_id, date, amount, students_count, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (period_id, university_id, date) DO UPDATE SET
            amount = EXCLUDED.amount,
            students_count = EXCLUDED.students_count,
            notes = EXCLUDED.notes,
            updated_at = now()
         RETURNING *`,
        [data.period_id, data.university_id, data.date, data.amount,
         data.students_count, data.notes || null, data.created_by || null]
    );
    return res.rows[0];
}

export async function deleteFeeDailyEntry(id: string, allowLocked = false) {
    await ensureFeeTables();
    const existing = await db.query(`SELECT date, locked_at FROM fee_daily_log WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new Error('Entry not found');
    const row = existing.rows[0];
    if (!allowLocked && row.locked_at) throw new Error('Entry is locked');
    if (!allowLocked && row.date.toISOString().split('T')[0] === todayInIST() && isPast8PmIST()) {
        throw new Error('Cannot delete after 8 PM IST');
    }
    await db.query(`DELETE FROM fee_daily_log WHERE id = $1`, [id]);
    return { success: true };
}

// ─── Payment Transactions (from Day_Wise_Payments tab) ──────────────

export async function upsertFeeTransaction(data: {
    period_id: string; zoho_user_id: string; payment_date: string;
    amount?: number; source?: string; university_id?: string;
}) {
    await ensureFeeTables();
    const res = await db.query(
        `INSERT INTO fee_payment_transactions (period_id, zoho_user_id, payment_date, amount, source, university_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (zoho_user_id, payment_date, period_id) DO UPDATE SET
            amount = COALESCE(EXCLUDED.amount, fee_payment_transactions.amount),
            source = COALESCE(EXCLUDED.source, fee_payment_transactions.source),
            university_id = COALESCE(EXCLUDED.university_id, fee_payment_transactions.university_id)
         RETURNING *`,
        [data.period_id, data.zoho_user_id, data.payment_date,
         data.amount || null, data.source || null, data.university_id || null]
    );
    return res.rows[0];
}

/**
 * Bulk upsert for payment transactions — 50x faster than calling
 * upsertFeeTransaction in a loop for 1,500+ rows.
 */
export async function bulkUpsertFeeTransactions(periodId: string, rows: Array<{
    zoho_user_id: string;
    payment_date: string;
    amount?: number | null;
    source?: string | null;
    university_id?: string | null;
}>) {
    await ensureFeeTables();
    if (!rows.length) return 0;

    const CHUNK = 300;
    let total = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const params: any[] = [periodId];
        const valueRows: string[] = [];
        let p = 2;
        for (const r of chunk) {
            valueRows.push(`($1, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
            params.push(
                r.zoho_user_id,
                r.payment_date,
                r.amount ?? null,
                r.source ?? null,
                r.university_id ?? null
            );
        }
        const res = await db.query(
            `INSERT INTO fee_payment_transactions
                (period_id, zoho_user_id, payment_date, amount, source, university_id)
             VALUES ${valueRows.join(', ')}
             ON CONFLICT (zoho_user_id, payment_date, period_id) DO UPDATE SET
                amount = COALESCE(EXCLUDED.amount, fee_payment_transactions.amount),
                source = COALESCE(EXCLUDED.source, fee_payment_transactions.source),
                university_id = COALESCE(EXCLUDED.university_id, fee_payment_transactions.university_id)`,
            params
        );
        total += res.rowCount || chunk.length;
    }
    return total;
}

/**
 * Returns a concise fee summary for embedding in daily/weekly/monthly ops reports.
 * Picks the most-recent active period if periodId is omitted.
 */
export async function getFeeReportSnapshot(periodId?: string) {
    await ensureFeeTables();
    let pid = periodId;
    if (!pid) {
        const active = await db.query(`SELECT id FROM fee_periods WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`);
        if (!active.rows.length) return null;
        pid = active.rows[0].id;
    }

    const summary = await getFeeOverallSummary(pid!);
    const topUniversities = await db.query(
        `SELECT COALESCE(u.short_name, u.name) AS university_name,
                COUNT(sp.id)::int AS strength,
                COUNT(sp.id) FILTER (WHERE sp.status = 'Fully Paid')::int AS fully_paid,
                COUNT(sp.id) FILTER (WHERE sp.status = 'Yet To Pay')::int AS not_paid,
                COALESCE(SUM(sp.payable), 0)::numeric AS payable,
                COALESCE(SUM(sp.paid), 0)::numeric AS paid,
                COALESCE(SUM(sp.pending), 0)::numeric AS pending,
                CASE WHEN SUM(sp.payable) > 0
                    THEN ROUND((SUM(sp.paid)::numeric / SUM(sp.payable)::numeric) * 100, 1)
                    ELSE 0 END AS efficiency
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE sp.period_id = $1
         GROUP BY u.short_name, u.name
         ORDER BY efficiency DESC
         LIMIT 5`,
        [pid]
    );
    const bottomUniversities = await db.query(
        `SELECT COALESCE(u.short_name, u.name) AS university_name,
                COUNT(sp.id)::int AS strength,
                COUNT(sp.id) FILTER (WHERE sp.status = 'Yet To Pay')::int AS not_paid,
                COALESCE(SUM(sp.pending), 0)::numeric AS pending,
                CASE WHEN SUM(sp.payable) > 0
                    THEN ROUND((SUM(sp.paid)::numeric / SUM(sp.payable)::numeric) * 100, 1)
                    ELSE 0 END AS efficiency
         FROM fee_student_payments sp
         JOIN universities u ON u.id = sp.university_id
         WHERE sp.period_id = $1
         GROUP BY u.short_name, u.name
         ORDER BY efficiency ASC
         LIMIT 5`,
        [pid]
    );
    const tagCounts = await db.query(
        `SELECT tag, COUNT(*)::int AS count
         FROM fee_student_tags t
         JOIN fee_student_payments sp ON sp.id = t.student_payment_id
         WHERE sp.period_id = $1
         GROUP BY tag ORDER BY count DESC`,
        [pid]
    );
    const periodInfo = await db.query(`SELECT name FROM fee_periods WHERE id = $1`, [pid]);

    return {
        period_id: pid,
        period_name: periodInfo.rows[0]?.name || 'Active Period',
        summary,
        topUniversities: topUniversities.rows,
        bottomUniversities: bottomUniversities.rows,
        tagCounts: tagCounts.rows,
    };
}

export async function getDailyPaymentRollup(periodId: string, filters: { university_id?: string; month?: number; year?: number } = {}) {
    await ensureFeeTables();
    const conditions: string[] = ['t.period_id = $1'];
    const params: any[] = [periodId];
    let i = 2;
    if (filters.university_id) { conditions.push(`t.university_id = $${i++}`); params.push(filters.university_id); }
    if (filters.month && filters.year) {
        conditions.push(`EXTRACT(MONTH FROM t.payment_date) = $${i++} AND EXTRACT(YEAR FROM t.payment_date) = $${i++}`);
        params.push(filters.month, filters.year);
    }
    const res = await db.query(
        `SELECT t.payment_date AS date,
                t.university_id,
                COALESCE(u.short_name, u.name) AS university_name,
                COUNT(*)::int AS payment_count,
                COALESCE(SUM(t.amount), 0)::numeric AS amount
         FROM fee_payment_transactions t
         LEFT JOIN universities u ON u.id = t.university_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY t.payment_date, t.university_id, u.short_name, u.name
         ORDER BY t.payment_date DESC, university_name`,
        params
    );
    return res.rows;
}
