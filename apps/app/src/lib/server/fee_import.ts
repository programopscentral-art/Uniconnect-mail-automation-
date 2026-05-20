/**
 * Fee Collection — CSV / Google Sheet import helpers.
 *
 * Handles the messy real-world data: matches universities by fuzzy name,
 * maps the actual `Userwise Data` column names, migrates legacy single-text
 * remarks into the new fee_remarks table, and auto-tags dropouts.
 */
import {
    db,
    getAllUniversities,
    upsertFeeStudentPayment,
    bulkUpsertFeeStudentPayments,
    createFeeRemark,
    toggleFeeStudentTag,
    upsertFeeTransaction,
    bulkUpsertFeeTransactions,
    upsertFeeUniversityMeta,
} from '@uniconnect/shared';

type SheetRow = Record<string, any>;

const toNum = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    const s = String(v).replace(/[₹,\s]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

const norm = (s: string): string => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const STATUS_MAP: Record<string, string> = {
    'fullypaid': 'Fully Paid',
    'fully': 'Fully Paid',
    'paid': 'Fully Paid',
    'partiallypaid': 'Partially Paid',
    'partial': 'Partially Paid',
    'yettopay': 'Yet To Pay',
    'notpaid': 'Yet To Pay',
    'null': 'Yet To Pay',
    'pending': 'Yet To Pay',
};

function normalizeStatus(raw: string, payable: number, paid: number): string {
    const k = norm(raw);
    if (STATUS_MAP[k]) return STATUS_MAP[k];
    if (paid >= payable && payable > 0) return 'Fully Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Yet To Pay';
}

/** Build a fuzzy university name → id map */
async function buildUniversityIndex(): Promise<Map<string, string>> {
    const all = await getAllUniversities();
    const idx = new Map<string, string>();
    for (const u of all) {
        if (u.name) idx.set(norm(u.name), u.id);
        if (u.short_name) idx.set(norm(u.short_name), u.id);
    }
    return idx;
}

function findUniversityId(idx: Map<string, string>, raw: string): string | null {
    if (!raw) return null;
    const key = norm(raw);
    if (idx.has(key)) return idx.get(key)!;
    // Try partial matches
    for (const [k, v] of idx.entries()) {
        if (k.includes(key) || key.includes(k)) return v;
    }
    return null;
}

/** Get value from a row by trying many candidate column names (case/space-insensitive) */
function pick(row: SheetRow, candidates: string[]): any {
    const keys = Object.keys(row);
    for (const c of candidates) {
        const k = norm(c);
        const found = keys.find((kk) => norm(kk).includes(k));
        if (found && row[found] !== '' && row[found] != null) return row[found];
    }
    return '';
}

/**
 * Import a single Userwise-Data style row into the DB.
 * Returns { created, updated, errors }.
 */
export async function importUserwiseRows(
    periodId: string,
    rows: SheetRow[],
    userId?: string,
    opts: { importRemarks?: boolean } = {}
): Promise<{ ok: number; skipped: number; errors: string[]; tagged: number; remarksImported: number }> {
    const uniIdx = await buildUniversityIndex();
    let skipped = 0, tagged = 0, remarksImported = 0;
    const errors: string[] = [];

    // Pass 1: validate + collect all rows into a single bulk insert
    type ParsedRow = {
        zoho: string;
        universityId: string;
        payable: number;
        paid: number;
        status: string;
        studentName: string;
        coach: string;
        activeStatus: string;
        paymentMethod: string | null;
        legacyRemarks: Array<{ text: string; case?: string }>;
    };
    const parsed: ParsedRow[] = [];

    for (const row of rows) {
        try {
            const zoho = String(pick(row, ['user id', 'userid', 'student id', 'zoho user id', 'payment link user id']) || '').trim();
            const uniRaw = String(pick(row, ['university', 'college', 'uni']) || '').trim();
            if (!zoho || !uniRaw) { skipped++; continue; }

            const universityId = findUniversityId(uniIdx, uniRaw);
            if (!universityId) {
                if (errors.length < 20) errors.push(`Unknown university "${uniRaw}" for student ${zoho.slice(0, 8)}`);
                skipped++;
                continue;
            }

            const payable = toNum(pick(row, ['total term 2 fee payabale', 'total term 2 fee payable', 'payable', 'fee']));
            const paid = toNum(pick(row, ['total term 2 fee paid', 'paid amount', 'paid']));
            const statusRaw = String(pick(row, ['payment status', 'status']) || '').trim();
            const coach = String(pick(row, ['success coach name', 'success coach', 'coach']) || '').trim();
            const activeStatus = String(pick(row, ['active status from zoho', 'active status', 'zoho status']) || '').trim();
            const studentName = String(pick(row, ['student name', 'name', 'names']) || '').trim();
            const status = normalizeStatus(statusRaw, payable, paid);

            const link = pick(row, ['link']);
            const escrow = pick(row, ['escrow']);
            const paymentMethod = link ? 'link' : escrow ? 'escrow' : null;

            // Collect legacy remarks but don't INSERT yet
            const legacyRemarks: Array<{ text: string; case?: string }> = [];
            if (opts.importRemarks) {
                const legacyRemark = String(pick(row, ['remarks', 'remark']) || '').trim();
                const unpaidRemark = String(pick(row, ['unpaid remarks']) || '').trim();
                const otherRemark = String(pick(row, ['other remarks']) || '').trim();
                const dropoutNote = String(pick(row, ['dropout']) || '').trim();
                const loanNote = String(pick(row, ['loan']) || '').trim();
                if (legacyRemark && legacyRemark !== '#N/A' && legacyRemark !== 'N/A') legacyRemarks.push({ text: legacyRemark });
                if (unpaidRemark && unpaidRemark !== '#N/A') legacyRemarks.push({ text: `[Unpaid] ${unpaidRemark}` });
                if (otherRemark && otherRemark !== '#N/A') legacyRemarks.push({ text: `[Other] ${otherRemark}` });
                if (dropoutNote && dropoutNote !== '#N/A' && norm(dropoutNote) !== 'no') legacyRemarks.push({ text: `Dropout flagged: ${dropoutNote}`, case: 'dropout' });
                if (loanNote && loanNote !== '#N/A' && norm(loanNote) !== 'no') legacyRemarks.push({ text: `Loan note: ${loanNote}`, case: 'loan' });
            }

            // Auto-tag dropouts based on Active Status (queued for batch later)
            if (norm(activeStatus).includes('dropout') || norm(activeStatus).includes('inactive')) {
                legacyRemarks.push({ text: '', case: 'dropout' }); // marker
            }

            parsed.push({ zoho, universityId, payable, paid, status, studentName, coach, activeStatus, paymentMethod, legacyRemarks });
        } catch (e: any) {
            if (errors.length < 20) errors.push(e?.message || String(e));
            skipped++;
        }
    }

    // Pass 2: bulk INSERT all student payments in one shot
    if (parsed.length > 0) {
        await bulkUpsertFeeStudentPayments(periodId, parsed.map(p => ({
            university_id: p.universityId,
            zoho_user_id: p.zoho,
            student_name: p.studentName,
            payable: p.payable,
            paid: p.paid,
            status: p.status,
            success_coach_name: p.coach || undefined,
            active_status: p.activeStatus || undefined,
            payment_method: p.paymentMethod || undefined,
        })));
    }

    // Pass 3: if remarks/tags requested, do them in a second pass (one query per remark, accepted as cost)
    if (opts.importRemarks && parsed.length > 0) {
        // Map zoho_user_id -> student_payment_id
        const idRes = await db.query(
            `SELECT id, zoho_user_id FROM fee_student_payments WHERE period_id = $1 AND zoho_user_id = ANY($2::text[])`,
            [periodId, parsed.map(p => p.zoho)]
        );
        const idMap = new Map<string, string>();
        for (const r of idRes.rows) idMap.set(r.zoho_user_id, r.id);

        for (const p of parsed) {
            const spId = idMap.get(p.zoho);
            if (!spId) continue;
            for (const r of p.legacyRemarks) {
                if (r.text) {
                    try {
                        await createFeeRemark({
                            student_payment_id: spId,
                            author_id: userId,
                            author_name: 'System Import',
                            role: 'System',
                            case_type: r.case,
                            text: r.text,
                            source: 'import',
                        });
                        remarksImported++;
                    } catch {}
                }
                if (r.case) {
                    try { await toggleFeeStudentTag(spId, r.case, userId); tagged++; } catch {}
                }
            }
        }
    }

    return { ok: parsed.length, skipped, errors, tagged, remarksImported };
}

/**
 * Import Day_Wise_Payments rows (Payment Link User ID, Payment Date)
 */
export async function importDayWisePayments(
    periodId: string,
    rows: SheetRow[]
): Promise<{ ok: number; skipped: number; errors: string[] }> {
    let skipped = 0;
    const errors: string[] = [];

    // Pre-fetch student payments to map zoho_user_id → university_id
    const spRes = await db.query(
        `SELECT zoho_user_id, university_id FROM fee_student_payments WHERE period_id = $1`,
        [periodId]
    );
    const spMap = new Map<string, string>();
    for (const r of spRes.rows) spMap.set(r.zoho_user_id, r.university_id);

    // Pass 1: parse + validate all rows into a batch
    const validRows: Array<{ zoho_user_id: string; payment_date: string; university_id: string | null }> = [];
    for (const row of rows) {
        try {
            const zoho = String(pick(row, ['payment link user id', 'user id', 'userid']) || '').trim();
            const dateRaw = pick(row, ['payment date', 'date']);
            if (!zoho || !dateRaw) { skipped++; continue; }

            const dateStr = parseGvizDate(dateRaw);
            if (!dateStr) {
                if (errors.length < 5) errors.push(`Bad date "${String(dateRaw).slice(0, 30)}" for ${zoho.slice(0, 8)}`);
                skipped++;
                continue;
            }

            validRows.push({
                zoho_user_id: zoho,
                payment_date: dateStr,
                university_id: spMap.get(zoho) || null,
            });
        } catch (e: any) {
            if (errors.length < 5) errors.push(e?.message?.slice(0, 100) || 'unknown');
            skipped++;
        }
    }

    // Pass 2: bulk INSERT all transactions in one go
    let ok = 0;
    if (validRows.length > 0) {
        try {
            ok = await bulkUpsertFeeTransactions(periodId, validRows);
        } catch (e: any) {
            errors.push(`Bulk insert failed: ${e.message?.slice(0, 100)}`);
            skipped += validRows.length;
        }
    }

    return { ok, skipped, errors };
}

/**
 * Parse any date format the Google Sheets gviz endpoint might return:
 * - "Date(2026,1,8)"  — JSON format (month is 0-indexed!)
 * - "8/2/2026"        — CSV format (MM/DD/YYYY)
 * - "2026-02-08"      — ISO
 * - Date object
 * Returns "YYYY-MM-DD" or empty string on failure.
 */
function parseGvizDate(raw: any): string {
    if (!raw) return '';
    if (raw instanceof Date) return raw.toISOString().split('T')[0];

    const s = String(raw).trim();
    if (!s) return '';

    // gviz JSON: "Date(2026,1,8)" → 2026-02-08 (month is 0-indexed in JS)
    const gvizMatch = s.match(/^Date\((\d+),(\d+),(\d+)/);
    if (gvizMatch) {
        const y = parseInt(gvizMatch[1]);
        const m = parseInt(gvizMatch[2]) + 1; // 0-indexed!
        const d = parseInt(gvizMatch[3]);
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // ISO: "2026-02-08" already
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    // MM/DD/YYYY or DD/MM/YYYY: ambiguous but US format is more common
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
            const [m, d, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    // Last resort: try Date parsing
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];

    return '';
}

/**
 * Import the university summary tab (Sheet1 of master sheet)
 * Columns: University, Count of Students Paid Fully, Count of Students Paid Partially, Count of Students Paid Null
 * Used to populate fee_university_meta with strength estimates if we don't have student-level rows yet.
 */
export async function importUniversitySummary(
    periodId: string,
    rows: SheetRow[]
): Promise<{ ok: number; skipped: number; errors: string[] }> {
    const uniIdx = await buildUniversityIndex();
    let ok = 0, skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
        try {
            const uniRaw = String(pick(row, ['university', 'college']) || '').trim();
            if (!uniRaw || norm(uniRaw) === 'total') { skipped++; continue; }
            const uId = findUniversityId(uniIdx, uniRaw);
            if (!uId) {
                if (errors.length < 10) errors.push(`Unknown university "${uniRaw}"`);
                skipped++;
                continue;
            }
            const full = toNum(pick(row, ['count of students paid fully', 'fully paid', 'full']));
            const partial = toNum(pick(row, ['count of students paid partially', 'partial']));
            const nullCount = toNum(pick(row, ['count of students paid null', 'null', 'not paid']));
            await upsertFeeUniversityMeta({
                period_id: periodId,
                university_id: uId,
                strength: full + partial + nullCount,
            });
            ok++;
        } catch (e: any) {
            if (errors.length < 10) errors.push(e?.message?.slice(0, 100) || 'unknown');
            skipped++;
        }
    }
    return { ok, skipped, errors };
}

/**
 * Fetch a Google Sheets tab as JSON rows via the gviz endpoint.
 * Sheet must be public (Anyone with link → Viewer).
 */
export async function fetchSheetTab(sheetId: string, tabName: string): Promise<SheetRow[]> {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout
    try {
        const r = await fetch(url, { signal: controller.signal });
        const t = await r.text();
        if (!r.ok) throw new Error(`Sheet fetch failed: HTTP ${r.status}. Make sure the sheet is shared "Anyone with the link → Viewer".`);
        const startIdx = t.indexOf('{');
        const endIdx = t.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1) throw new Error('Sheet returned invalid JSON. Check that the tab name is exact (case-sensitive) and the sheet is public.');
        const j = JSON.parse(t.substring(startIdx, endIdx + 1));
        if (j.status === 'error') throw new Error(`Sheet error: ${(j.errors?.[0]?.detailed_message || j.errors?.[0]?.message || 'unknown').slice(0, 200)}`);
        const cols = j.table.cols.map((c: any) => c.label || c.id || '');
        return j.table.rows.map((row: any) => {
            const o: SheetRow = {};
            cols.forEach((c: string, i: number) => {
                o[c] = row.c[i] ? (row.c[i].v ?? row.c[i].f ?? '') : '';
            });
            return o;
        });
    } finally {
        clearTimeout(timeout);
    }
}

/** Simple CSV parser — handles quoted fields with commas + escaped quotes. */
export function parseCSV(text: string): SheetRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map((line) => {
        const vals = parseCSVLine(line);
        const obj: SheetRow = {};
        headers.forEach((h, i) => obj[h] = vals[i] ?? '');
        return obj;
    });
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
}
