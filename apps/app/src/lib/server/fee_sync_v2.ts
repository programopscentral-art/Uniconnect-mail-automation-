/**
 * Fee Collection v2 — sync logic.
 *
 * Reads a fee_semester_window's Google Sheet (must be public — Anyone with
 * link → Viewer) and ingests its sub-sheets:
 *
 *   - Batch sub-sheets: pattern `^(\d{4})-Semester (\d+)$`. Each yields a
 *     fee_batch_period row + N fee_student_payments rows.
 *   - Dates sub-sheet (configurable, default "semester 3 dates"):
 *     one row per university with fee_per_student + collection windows.
 *     Linked to every batch_period in the window so the UI can show
 *     dates per (batch, university).
 *   - Dropout sub-sheet (configurable, default "dropout"): one row per
 *     dropped student, deduped by zoho_user_id within the window.
 *
 * Reuses fetchSheetTab + findUniversityId from the existing fee_import
 * module — no new Google Sheets API auth needed.
 *
 * The student-row headers are locked to the spec:
 *   User ID | University | Student name |
 *   Previous Fee Due | Current Term Discount |
 *   Total Term Fee Payable | Total Term Fee Paid |
 *   Total Term Fee (Payable - Paid) | Payment Status |
 *   registration date | Registration Status | Tag case | success coach name
 *
 * Tag case values come from a fixed enum so the UI's pill picker stays in
 * sync with what the sheet can contain. Unknown tag values get stored
 * verbatim so the operator can clean them up later.
 */
import { db, getAllUniversities } from '@uniconnect/shared';
import { fetchSheetTab } from './fee_import';

// ── Types ────────────────────────────────────────────────────────────────

export interface SyncSummary {
    window_id: string;
    sheet_id: string;
    started_at: string;
    finished_at: string;
    batch_periods_synced: number;
    students_upserted: number;
    universities_unmatched: string[];
    dates_rows_upserted: number;
    dropouts_upserted: number;
    errors: Array<{ sub_sheet: string; message: string }>;
    elapsed_ms: number;
}

const BATCH_TAB_RE = /^\s*(\d{4})\s*[-–—‐‑‒―−]\s*Semester\s*(\d+)\s*$/i;

// Lock the canonical tag-case values from the spec.
export const TAG_CASES = [
    'Dropout',
    'Will Pay',
    'Wants to Drop',
    'Hostel Caution Deposit Query',
    'Propelled Loan Case',
    'Sales Team Dependency',
    'Referral Amount Query',
    'Other',
    'Payment Completed',
    'Loan Applied',
    'Yet to Apply for Loan',
    'UTR Verification Pending',
    'Finance Team Dependency',
    'Fee Waiver Request',
] as const;
export type TagCase = typeof TAG_CASES[number];

const norm = (s: string): string => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TAG_NORM_MAP = new Map<string, TagCase>(TAG_CASES.map(t => [norm(t), t]));

function normalizeTagCase(raw: string | null | undefined): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const canonical = TAG_NORM_MAP.get(norm(s));
    return canonical ?? s; // unknown values stored verbatim
}

function toNum(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0;
    const s = String(v).replace(/[₹,\s]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function pickValue(row: Record<string, unknown>, candidates: string[]): unknown {
    const keys = Object.keys(row);
    for (const c of candidates) {
        const ck = norm(c);
        // Look at ALL keys whose base name (with any `__N` duplicate suffix
        // stripped) matches the candidate, and return the first NON-EMPTY
        // value. fetchSheetTab suffixes duplicate column headers as
        // `header__2`, `header__3`, etc. so a sheet with two columns named
        // "Total Term  Fee Payabale" where the second is empty still gives
        // us the first column's data.
        for (const k of keys) {
            const base = k.replace(/__\d+$/, '');
            if (norm(base) !== ck) continue;
            const v = row[k];
            if (v === null || v === undefined || v === '') continue;
            return v;
        }
    }
    return null;
}

// ── University matching (reuses logic style from fee_import) ─────────────

interface UniIndexEntry { id: string; matched: boolean; }

async function buildUniversityIndex(): Promise<Map<string, string>> {
    const unis = await getAllUniversities();
    const idx = new Map<string, string>();
    for (const u of unis) {
        if (u.name) idx.set(norm(u.name), u.id);
        if ((u as { slug?: string }).slug) idx.set(norm((u as { slug?: string }).slug!), u.id);
    }
    // Fold the fee_university_alias table into the same index. Aliases win
    // over fuzzy matches because operators add them explicitly when the
    // sheet uses informal names ("Takshasila" / "ADYPU" / "KKH Batch-2"
    // etc) that won't fuzzy-match the canonical registry rows.
    try {
        const aliasRes = await db.query(`SELECT alias_key, university_id FROM fee_university_alias`);
        for (const row of aliasRes.rows as Array<{ alias_key: string; university_id: string }>) {
            idx.set(row.alias_key, row.university_id);
        }
    } catch (e) {
        console.warn('[fee_sync_v2] alias table read failed (ok if migration not applied yet):', (e as Error).message);
    }
    return idx;
}

function findUniversityIdInIndex(idx: Map<string, string>, raw: string): string | null {
    if (!raw) return null;
    const key = norm(raw);
    if (idx.has(key)) return idx.get(key)!;
    // Try stripping common suffixes
    const stripped = key
        .replace(/userwise(data)?$/i, '')
        .replace(/sheet\d*$/i, '')
        .replace(/sem\d*$/i, '')
        .replace(/batch\d*$/i, '')
        .replace(/term(and)?\d*$/i, '');
    if (stripped !== key && stripped.length > 1) {
        if (idx.has(stripped)) return idx.get(stripped)!;
        for (const [k, v] of idx.entries()) {
            if (k.startsWith(stripped) || stripped.startsWith(k)) return v;
        }
    }
    for (const [k, v] of idx.entries()) {
        if (k.length >= 3 && (k.includes(key) || key.includes(k))) return v;
    }
    return null;
}

// ── Date parsing for dates sub-sheet ─────────────────────────────────────

function parseLooseDate(raw: unknown): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Try gviz "Date(YYYY,M,D)" first
    const gviz = s.match(/^Date\((\d+),(\d+),(\d+)/);
    if (gviz) {
        const [, y, m, d] = gviz;
        return `${y}-${String(Number(m) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Try ISO YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    // Try DD-MM-YYYY or DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Fallback: return as-is (UI shows raw string)
    return s.slice(0, 32);
}

// ── Sub-sheet processors ─────────────────────────────────────────────────

interface BatchPeriodRow {
    id: string;
    subsheet_name: string;
    batch_start_year: number;
    semester_number: number;
}

async function upsertBatchPeriod(
    window_id: string,
    subsheet_name: string,
    batch_start_year: number,
    semester_number: number,
): Promise<BatchPeriodRow> {
    const display_name = `NIAT Batch ${batch_start_year} · Semester ${semester_number}`;
    const r = await db.query<{ id: string }>(
        `INSERT INTO fee_batch_period
            (window_id, batch_start_year, semester_number, subsheet_name, display_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (window_id, subsheet_name) DO UPDATE
            SET batch_start_year = EXCLUDED.batch_start_year,
                semester_number  = EXCLUDED.semester_number,
                display_name     = EXCLUDED.display_name,
                updated_at       = now()
         RETURNING id`,
        [window_id, batch_start_year, semester_number, subsheet_name, display_name],
    );
    return { id: r.rows[0].id, subsheet_name, batch_start_year, semester_number };
}

async function syncBatchSubsheet(
    window_id: string,
    sheet_id: string,
    subsheet_name: string,
    uniIdx: Map<string, string>,
    summary: SyncSummary,
): Promise<void> {
    const m = subsheet_name.match(BATCH_TAB_RE);
    if (!m) return;
    const batch_start_year = parseInt(m[1], 10);
    const semester_number = parseInt(m[2], 10);

    let rows: Record<string, unknown>[];
    try {
        rows = await fetchSheetTab(sheet_id, subsheet_name);
    } catch (e) {
        summary.errors.push({ sub_sheet: subsheet_name, message: (e as Error).message });
        return;
    }

    const bp = await upsertBatchPeriod(window_id, subsheet_name, batch_start_year, semester_number);

    // Collect every row in memory first, then batch-upsert in chunks. Doing
    // one INSERT per student through the pooler turned a 4.5k-student batch
    // into a ~19-minute sync; chunked multi-row INSERTs bring it under 1s.
    type StudentRow = {
        zoho_user_id: string; university_id: string; student_name: string;
        previous_fee_due: number; current_term_discount: number;
        payable: number; paid: number;
        status_raw: string; registration_status: string | null;
        registration_date: string | null; tag_case: string | null;
        success_coach_name: string | null;
    };
    const buffer: StudentRow[] = [];
    const seenZoho = new Set<string>();
    for (const r of rows) {
        const zoho_user_id = String(pickValue(r, ['User ID', 'UserID', 'NIAT ID', 'Zoho User ID']) ?? '').trim();
        if (!zoho_user_id) continue;
        // Multi-row INSERT ... ON CONFLICT throws "cannot affect row a second
        // time" when two rows in the same statement share the same
        // (batch_period_id, zoho_user_id). Keep only the LAST occurrence
        // for a given zoho_user_id within the sheet (sheet sometimes has
        // duplicate rows).
        if (seenZoho.has(zoho_user_id)) {
            const idx = buffer.findIndex(b => b.zoho_user_id === zoho_user_id);
            if (idx >= 0) buffer.splice(idx, 1);
        }

        const uniRaw = String(pickValue(r, ['University']) ?? '').trim();
        const university_id = findUniversityIdInIndex(uniIdx, uniRaw);
        if (!university_id && uniRaw && !summary.universities_unmatched.includes(uniRaw)) {
            summary.universities_unmatched.push(uniRaw);
            continue;
        }
        if (!university_id) continue;

        const student_name = String(pickValue(r, ['Student name', 'Student Name', 'Name']) ?? '').trim();
        const previous_fee_due = toNum(pickValue(r, ['Previous Fee Due', 'Previous Fee Due / Excess Amount']));
        const current_term_discount = toNum(pickValue(r, ['Current Term Discount']));
        const payable = toNum(pickValue(r, ['Total Term Fee Payable', 'Total Term Fee Payabale']));
        const paid = toNum(pickValue(r, ['Total Term Fee Paid']));
        // NOTE: `pending` is a GENERATED ALWAYS column in Postgres
        //   (GREATEST(payable - paid, 0)) — do not write to it.
        const status_raw = String(pickValue(r, ['Payment Status']) ?? '').trim() || 'Yet To Pay';
        const registration_date_raw = pickValue(r, ['registration date', 'Registration Date']);
        const registration_date = parseLooseDate(registration_date_raw);
        const registration_status = String(pickValue(r, ['Registration Status']) ?? '').trim() || null;
        const tag_case = normalizeTagCase(pickValue(r, ['Tag case', 'Tag Case']) as string);
        const success_coach_name = String(pickValue(r, ['success coach name', 'Success Coach Name']) ?? '').trim() || null;

        buffer.push({
            zoho_user_id, university_id, student_name,
            previous_fee_due, current_term_discount, payable, paid,
            status_raw, registration_status, registration_date, tag_case, success_coach_name,
        });
        seenZoho.add(zoho_user_id);
    }

    // Chunked bulk upsert. 500 rows × 13 params/row = 6500 params per call,
    // well under Postgres' 65535 parameter limit.
    const CHUNK = 500;
    let studentCount = 0;
    for (let start = 0; start < buffer.length; start += CHUNK) {
        const slice = buffer.slice(start, start + CHUNK);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        slice.forEach((s, i) => {
            const o = i * 13;
            placeholders.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12},$${o+13},now(),now())`);
            values.push(
                bp.id, s.university_id, s.zoho_user_id, s.student_name,
                s.payable, s.paid, s.previous_fee_due, s.current_term_discount,
                s.status_raw, s.registration_status, s.registration_date, s.tag_case,
                s.success_coach_name,
            );
        });
        await db.query(
            `INSERT INTO fee_student_payments
                (batch_period_id, university_id, zoho_user_id, student_name,
                 payable, paid, previous_fee_due, current_term_discount,
                 status, registration_status, registration_date, tag_case,
                 success_coach_name, imported_at, updated_at)
             VALUES ${placeholders.join(',')}
             ON CONFLICT (batch_period_id, zoho_user_id) WHERE batch_period_id IS NOT NULL
             DO UPDATE SET
                university_id        = EXCLUDED.university_id,
                student_name         = COALESCE(NULLIF(EXCLUDED.student_name, ''), fee_student_payments.student_name),
                payable              = EXCLUDED.payable,
                paid                 = EXCLUDED.paid,
                previous_fee_due     = EXCLUDED.previous_fee_due,
                current_term_discount = EXCLUDED.current_term_discount,
                status               = EXCLUDED.status,
                registration_status  = EXCLUDED.registration_status,
                registration_date    = EXCLUDED.registration_date,
                tag_case             = EXCLUDED.tag_case,
                success_coach_name   = EXCLUDED.success_coach_name,
                imported_at          = now(),
                updated_at           = now()`,
            values,
        );
        studentCount += slice.length;
        summary.students_upserted += slice.length;
    }

    await db.query(
        `UPDATE fee_batch_period
            SET student_count = $2, last_synced_at = now(),
                last_sync_summary = $3::jsonb, updated_at = now()
          WHERE id = $1`,
        [bp.id, studentCount, JSON.stringify({ students: studentCount, at: new Date().toISOString() })],
    );
    summary.batch_periods_synced++;
}

async function syncDatesSubsheet(
    window_id: string,
    sheet_id: string,
    subsheet_name: string,
    batchPeriodIds: string[],
    uniIdx: Map<string, string>,
    summary: SyncSummary,
): Promise<void> {
    if (!subsheet_name || batchPeriodIds.length === 0) return;
    let rows: Record<string, unknown>[];
    try {
        rows = await fetchSheetTab(sheet_id, subsheet_name);
    } catch (e) {
        summary.errors.push({ sub_sheet: subsheet_name, message: (e as Error).message });
        return;
    }

    type MetaRow = {
        university_id: string; fee_per_student: number | null;
        sem_last_date: string | null; collection_start_date: string | null;
        collection_end_date: string | null; next_sem_start_date: string | null;
        meta_remarks: string | null;
    };
    const buffer: MetaRow[] = [];
    const seenUni = new Set<string>();
    for (const r of rows) {
        const uniRaw = String(pickValue(r, ['University']) ?? '').trim();
        if (!uniRaw) continue;
        const university_id = findUniversityIdInIndex(uniIdx, uniRaw);
        if (!university_id) {
            if (!summary.universities_unmatched.includes(uniRaw)) summary.universities_unmatched.push(uniRaw);
            continue;
        }
        if (seenUni.has(university_id)) continue; // dates sheet shouldn't repeat a uni; if it does, first wins
        seenUni.add(university_id);
        const fee_amount_raw = pickValue(r, ['General Sem 3 / Sem 5 Fee Amount', 'Fee Amount']);
        buffer.push({
            university_id,
            fee_per_student: toNum(fee_amount_raw) || null,
            sem_last_date: String(pickValue(r, ['Sem 2 last date', 'Sem 2 Last Date', 'Previous sem last date']) ?? '').trim() || null,
            collection_start_date: String(pickValue(r, ['Sem 3 / Sem 5 Fee Collection Start Date', 'Fee Collection Start Date']) ?? '').trim() || null,
            collection_end_date: String(pickValue(r, ['Sem 3 / Sem 5 Fee Collection Last Date', 'Fee Collection Last Date']) ?? '').trim() || null,
            next_sem_start_date: String(pickValue(r, ['Sem 3 / Sem 5 Start Date', 'Sem Start Date']) ?? '').trim() || null,
            meta_remarks: String(pickValue(r, ['remarks', 'Remarks']) ?? '').trim() || null,
        });
    }

    // Fan out to every batch_period in this window, in a single bulk INSERT
    // per batch_period instead of one per (batch × university). Replaces what
    // was ~3 batches × 18 universities = 54 round-trips with 3 round-trips.
    for (const bp_id of batchPeriodIds) {
        if (buffer.length === 0) continue;
        const values: unknown[] = [];
        const placeholders: string[] = [];
        buffer.forEach((m, i) => {
            const o = i * 8;
            placeholders.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},now())`);
            values.push(bp_id, m.university_id, m.fee_per_student, m.sem_last_date,
                m.collection_start_date, m.collection_end_date, m.next_sem_start_date, m.meta_remarks);
        });
        await db.query(
            `INSERT INTO fee_university_meta
                (batch_period_id, university_id, fee_per_student, sem_last_date,
                 collection_start_date, collection_end_date, next_sem_start_date,
                 meta_remarks, updated_at)
             VALUES ${placeholders.join(',')}
             ON CONFLICT (batch_period_id, university_id) WHERE batch_period_id IS NOT NULL
             DO UPDATE SET
                fee_per_student       = EXCLUDED.fee_per_student,
                sem_last_date         = EXCLUDED.sem_last_date,
                collection_start_date = EXCLUDED.collection_start_date,
                collection_end_date   = EXCLUDED.collection_end_date,
                next_sem_start_date   = EXCLUDED.next_sem_start_date,
                meta_remarks          = EXCLUDED.meta_remarks,
                updated_at            = now()`,
            values,
        );
        summary.dates_rows_upserted += buffer.length;
    }
}

async function syncDropoutSubsheet(
    window_id: string,
    sheet_id: string,
    subsheet_name: string,
    uniIdx: Map<string, string>,
    summary: SyncSummary,
): Promise<void> {
    if (!subsheet_name) return;
    let rows: Record<string, unknown>[];
    try {
        rows = await fetchSheetTab(sheet_id, subsheet_name);
    } catch (e) {
        summary.errors.push({ sub_sheet: subsheet_name, message: (e as Error).message });
        return;
    }

    // Parse rows first
    type DropoutRow = {
        zoho_user_id: string; university_id: string | null;
        student_name: string | null; dropped_at: string | null;
        reason: string | null; raw_row: string;
    };
    const buffer: DropoutRow[] = [];
    const seenZoho = new Set<string>();
    for (const r of rows) {
        // Dropout sheet uses 'UID' for the same UUID that batch sheets call
        // 'User ID'. Prefer UID first so the link to fee_student_payments
        // (which stores zoho_user_id from batch sheets) actually matches.
        // 'NIAT ID' is kept last as a fallback for sheets that only carry
        // the human-readable code.
        const zoho_user_id = String(pickValue(r, ['UID', 'User ID', 'UserID', 'Zoho User ID', 'NIAT ID']) ?? '').trim();
        if (!zoho_user_id || seenZoho.has(zoho_user_id)) continue;
        seenZoho.add(zoho_user_id);
        const uniRaw = String(pickValue(r, ['University', 'Unversity name', 'University name', 'University Name']) ?? '').trim();
        buffer.push({
            zoho_user_id,
            university_id: findUniversityIdInIndex(uniIdx, uniRaw),
            student_name: String(pickValue(r, ['Student name', 'Student Name', 'Name']) ?? '').trim() || null,
            dropped_at: parseLooseDate(pickValue(r, ['Dropout date', 'Dropped at', 'Drop date', 'Date'])),
            // 'Reason for dropout' is the primary column on the NIAT sheet;
            // 'Remarks' is a secondary follow-up note. Fall through both.
            reason: String(pickValue(r, ['Reason for dropout', 'Reason for Dropout', 'Reason', 'reason', 'Dropout reason', 'Remarks', 'remarks']) ?? '').trim() || null,
            raw_row: JSON.stringify(r),
        });
    }

    if (buffer.length === 0) return;

    // ONE lookup: resolve every zoho_user_id → batch_period_id in this window
    // in a single query instead of one query per dropout row.
    const bpMap = new Map<string, string>();
    const lookup = await db.query(
        `SELECT DISTINCT ON (fsp.zoho_user_id)
                fsp.zoho_user_id, fsp.batch_period_id
           FROM fee_student_payments fsp
           JOIN fee_batch_period fbp ON fbp.id = fsp.batch_period_id
          WHERE fbp.window_id = $1
            AND fsp.zoho_user_id = ANY($2::text[])
          ORDER BY fsp.zoho_user_id, fbp.batch_start_year DESC`,
        [window_id, buffer.map(b => b.zoho_user_id)],
    );
    for (const row of lookup.rows) bpMap.set(row.zoho_user_id, row.batch_period_id);

    // Bulk upsert dropout_log in chunks
    const CHUNK = 500;
    for (let start = 0; start < buffer.length; start += CHUNK) {
        const slice = buffer.slice(start, start + CHUNK);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        slice.forEach((d, i) => {
            const o = i * 8;
            placeholders.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8}::jsonb,now())`);
            values.push(window_id, bpMap.get(d.zoho_user_id) ?? null, d.zoho_user_id, d.university_id,
                d.student_name, d.dropped_at, d.reason, d.raw_row);
        });
        await db.query(
            `INSERT INTO fee_dropout_log
                (window_id, batch_period_id, zoho_user_id, university_id,
                 student_name, dropped_at, reason, raw_row, imported_at)
             VALUES ${placeholders.join(',')}
             ON CONFLICT (window_id, zoho_user_id) DO UPDATE SET
                batch_period_id = EXCLUDED.batch_period_id,
                university_id   = EXCLUDED.university_id,
                student_name    = EXCLUDED.student_name,
                dropped_at      = EXCLUDED.dropped_at,
                reason          = EXCLUDED.reason,
                raw_row         = EXCLUDED.raw_row,
                imported_at     = now()`,
            values,
        );
        summary.dropouts_upserted += slice.length;
    }

    // One bulk UPDATE auto-tagging every matched dropout as 'Dropout'
    const tagged = buffer.filter(d => bpMap.has(d.zoho_user_id));
    if (tagged.length > 0) {
        await db.query(
            `UPDATE fee_student_payments fsp
                SET tag_case = 'Dropout', updated_at = now()
               FROM (SELECT unnest($1::uuid[]) AS bp_id, unnest($2::text[]) AS zoho) m
              WHERE fsp.batch_period_id = m.bp_id
                AND fsp.zoho_user_id    = m.zoho
                AND (fsp.tag_case IS NULL OR fsp.tag_case <> 'Dropout')`,
            [tagged.map(d => bpMap.get(d.zoho_user_id)), tagged.map(d => d.zoho_user_id)],
        );
    }
}

// ── Top-level: sync one window ───────────────────────────────────────────

export async function syncFeeSemesterWindow(window_id: string): Promise<SyncSummary> {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();
    const winRes = await db.query<{
        id: string; sheet_id: string;
        batch_subsheets: string; dates_subsheet: string | null; dropout_subsheet: string | null;
    }>(
        `SELECT id, sheet_id, batch_subsheets, dates_subsheet, dropout_subsheet
           FROM fee_semester_window WHERE id = $1`,
        [window_id],
    );
    const win = winRes.rows[0];
    if (!win) throw new Error('Window not found');
    if (!win.sheet_id) throw new Error('Window has no sheet_id configured');

    const summary: SyncSummary = {
        window_id, sheet_id: win.sheet_id, started_at: startedAt, finished_at: '',
        batch_periods_synced: 0, students_upserted: 0,
        universities_unmatched: [], dates_rows_upserted: 0, dropouts_upserted: 0,
        errors: [], elapsed_ms: 0,
    };

    const uniIdx = await buildUniversityIndex();
    const batchSheets = (win.batch_subsheets ?? '')
        .split(/[\r\n,]+/)
        .map(s => s.trim())
        .filter(s => s && BATCH_TAB_RE.test(s));

    // Process each batch sub-sheet
    for (const name of batchSheets) {
        await syncBatchSubsheet(window_id, win.sheet_id, name, uniIdx, summary);
    }

    // Collect newly-known batch_period ids for the dates fanout
    const bps = await db.query<{ id: string }>(
        `SELECT id FROM fee_batch_period WHERE window_id = $1`, [window_id],
    );
    const batchPeriodIds = bps.rows.map(r => r.id);

    if (win.dates_subsheet) {
        await syncDatesSubsheet(window_id, win.sheet_id, win.dates_subsheet, batchPeriodIds, uniIdx, summary);
    }
    if (win.dropout_subsheet) {
        await syncDropoutSubsheet(window_id, win.sheet_id, win.dropout_subsheet, uniIdx, summary);
    }

    const finishedMs = Date.now();
    summary.finished_at = new Date(finishedMs).toISOString();
    summary.elapsed_ms = finishedMs - startedMs;

    await db.query(
        `UPDATE fee_semester_window
            SET last_synced_at = now(),
                last_sync_error = $2,
                last_sync_summary = $3::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [window_id, summary.errors.length > 0 ? summary.errors.map(e => `${e.sub_sheet}: ${e.message}`).join(' | ') : null, JSON.stringify(summary)],
    );

    // Daily snapshot for the trend chart. Idempotent — ON CONFLICT keeps the
    // FIRST snapshot per (window, IST-date), so a 5-min auto-sync doesn't
    // overwrite the morning snapshot mid-day. Computed against the freshly
    // upserted state.
    const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.query(
        `INSERT INTO fee_collection_snapshot
            (window_id, snapshot_date, students, fully_paid, partial, yet_to_pay,
             dropouts, total_payable, total_paid, collection_pct_x100)
         SELECT $1, $2::date,
                COUNT(fsp.id)::int,
                COUNT(*) FILTER (WHERE fsp.status = 'Fully Paid')::int,
                COUNT(*) FILTER (WHERE fsp.status = 'Partially Paid')::int,
                COUNT(*) FILTER (WHERE fsp.status = 'Yet To Pay')::int,
                (SELECT COUNT(*)::int FROM fee_dropout_log WHERE window_id = $1),
                COALESCE(SUM(fsp.payable), 0),
                COALESCE(SUM(fsp.paid), 0),
                CASE WHEN COALESCE(SUM(fsp.payable),0) > 0
                     THEN ROUND(SUM(fsp.paid) * 100.0 / SUM(fsp.payable))::int
                     ELSE 0 END
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
          WHERE bp.window_id = $1
         ON CONFLICT (window_id, snapshot_date) DO NOTHING`,
        [window_id, istDate],
    );

    return summary;
}
