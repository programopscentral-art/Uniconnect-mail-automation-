import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import * as XLSX from 'xlsx';
import { importQuestionBank } from '$lib/server/question_import';
import { isExamGlobal } from '$lib/server/assessment_access';

/**
 * Bulk question-bank upload — one spreadsheet covering MANY subjects.
 *
 * scope 'UNIVERSITY' : every row belongs to the given university; a `Subject`
 *                      column says which subject.
 * scope 'GLOBAL'     : rows may span universities; a `University` column says
 *                      which (falling back to universityId when absent).
 *
 * Rows are grouped by subject, the subject is matched by NAME (case-insensitive)
 * within its university and created when missing, then each group is handed to
 * the SAME importQuestionBank() the per-subject upload uses — so units, topics,
 * COs, MCQ options and answer keys are all parsed by the one proven path.
 */

const norm = (v: any) => String(v ?? '').trim();
const lower = (v: any) => norm(v).toLowerCase();

/** First matching header value in a row, by fuzzy header name. */
function pick(row: any, keywords: string[]): string {
    const keys = Object.keys(row || {});
    for (const kw of keywords) {
        const exact = keys.find((k) => k.toLowerCase().trim() === kw);
        if (exact) return norm(row[exact]);
    }
    for (const kw of keywords) {
        const loose = keys.find((k) => k.toLowerCase().includes(kw));
        if (loose) return norm(row[loose]);
    }
    return '';
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!isExamGlobal(locals.user)) {
        throw error(403, 'Only Admin / Program Ops / SME can bulk-upload a question bank.');
    }

    const form = await request.formData();
    const file = form.get('file') as File;
    const scope = (norm(form.get('scope')) || 'UNIVERSITY').toUpperCase();
    const universityId = norm(form.get('universityId'));
    const branchIdIn = norm(form.get('branchId'));
    const sheetName = norm(form.get('sheetName'));

    if (!file) throw error(400, 'A spreadsheet file is required.');
    if (scope === 'UNIVERSITY' && !universityId) {
        throw error(400, 'Pick a university for a university-level upload.');
    }

    const fname = String(file.name || '').toLowerCase();
    if (!fname.endsWith('.xlsx') && !fname.endsWith('.xls')) {
        throw error(400, 'Bulk upload needs an .xlsx / .xls file (it must carry a Subject column).');
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheets = sheetName ? [sheetName] : workbook.SheetNames;

    // ── 1. Read every row, tagging it with its university + subject ──────────
    type Row = { row: any; uniName: string; subjectName: string };
    const rows: Row[] = [];
    const skipped: Array<{ sheet: string; reason: string; count: number }> = [];
    let noSubject = 0;

    for (const sName of sheets) {
        const sheet = workbook.Sheets[sName];
        if (!sheet) continue;
        for (const r of XLSX.utils.sheet_to_json(sheet) as any[]) {
            const subjectName = pick(r, ['subject', 'course title', 'course name', 'course']);
            if (!subjectName) { noSubject++; continue; }
            const uniName = scope === 'GLOBAL'
                ? pick(r, ['university', 'college', 'institution', 'campus'])
                : '';
            rows.push({ row: r, uniName, subjectName });
        }
    }
    if (noSubject) skipped.push({ sheet: '(all)', reason: 'No Subject column value on the row', count: noSubject });
    if (!rows.length) {
        throw error(400, 'No rows carried a Subject column. Add a "Subject" column naming the subject for each question.');
    }

    // ── 2. Resolve universities ──────────────────────────────────────────────
    const uniRows = (await db.query(
        `SELECT id, name, COALESCE(short_name, '') AS short_name FROM universities WHERE status = 'ACTIVE'`,
    )).rows as Array<{ id: string; name: string; short_name: string }>;

    const findUniversity = (name: string): string | null => {
        if (!name) return universityId || null;
        const n = lower(name);
        const hit = uniRows.find(
            (u) => lower(u.name) === n || (u.short_name && lower(u.short_name) === n),
        ) || uniRows.find((u) => lower(u.name).includes(n) || n.includes(lower(u.name)));
        return hit?.id ?? null;
    };

    /** A branch to hang new subjects off; creates a General batch/branch if none. */
    const branchCache = new Map<string, string>();
    async function branchFor(uniId: string): Promise<string> {
        if (branchIdIn && uniId === universityId) return branchIdIn;
        const cached = branchCache.get(uniId);
        if (cached) return cached;

        const existing = await db.query(
            `SELECT id FROM assessment_branches WHERE university_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [uniId],
        );
        if (existing.rows.length) {
            branchCache.set(uniId, existing.rows[0].id);
            return existing.rows[0].id;
        }
        // Auto-create a home for imported subjects.
        let batch = (await db.query(
            `SELECT id FROM assessment_batches WHERE university_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [uniId],
        )).rows[0];
        if (!batch) {
            batch = (await db.query(
                `INSERT INTO assessment_batches (university_id, name) VALUES ($1, 'General') RETURNING id`,
                [uniId],
            )).rows[0];
        }
        const created = (await db.query(
            `INSERT INTO assessment_branches (university_id, batch_id, name, code) VALUES ($1, $2, 'General', 'GEN') RETURNING id`,
            [uniId, batch.id],
        )).rows[0];
        branchCache.set(uniId, created.id);
        return created.id;
    }

    /** Match a subject by NAME within a university; create it when missing. */
    const subjectCache = new Map<string, string>();
    async function subjectFor(uniId: string, name: string, semester = 1): Promise<string> {
        const key = `${uniId}::${lower(name)}`;
        const cached = subjectCache.get(key);
        if (cached) return cached;

        const found = await db.query(
            `SELECT s.id FROM assessment_subjects s
               JOIN assessment_branches b ON b.id = s.branch_id
              WHERE b.university_id = $1 AND LOWER(TRIM(s.name)) = $2
              ORDER BY s.created_at ASC LIMIT 1`,
            [uniId, lower(name)],
        );
        if (found.rows.length) {
            subjectCache.set(key, found.rows[0].id);
            return found.rows[0].id;
        }

        const branchId = await branchFor(uniId);
        const batchId = (await db.query(`SELECT batch_id FROM assessment_branches WHERE id = $1`, [branchId]))
            .rows[0]?.batch_id ?? null;
        // semester is NOT NULL on assessment_subjects — default to 1 when the
        // sheet doesn't say.
        const created = (await db.query(
            `INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester) VALUES ($1, $2, $3, '', $4) RETURNING id`,
            [branchId, batchId, norm(name), semester],
        )).rows[0];
        subjectCache.set(key, created.id);
        return created.id;
    }

    // ── 3. Group rows by (university, subject) ───────────────────────────────
    const groups = new Map<string, { uniId: string; subjectName: string; semester: number; rows: any[] }>();
    const unresolved: Array<{ subject: string; university: string; count: number }> = [];

    for (const r of rows) {
        const uniId = findUniversity(r.uniName);
        if (!uniId) {
            const key = `${r.subjectName}::${r.uniName}`;
            const e = unresolved.find((u) => `${u.subject}::${u.university}` === key);
            if (e) e.count++;
            else unresolved.push({ subject: r.subjectName, university: r.uniName, count: 1 });
            continue;
        }
        const key = `${uniId}::${lower(r.subjectName)}`;
        if (!groups.has(key)) {
            const sem = parseInt(pick(r.row, ['semester', 'sem']), 10);
            groups.set(key, { uniId, subjectName: r.subjectName, semester: Number.isFinite(sem) && sem > 0 ? sem : 1, rows: [] });
        }
        groups.get(key)!.rows.push(r.row);
    }

    // ── 4. Import each subject through the shared importer ───────────────────
    const results: Array<{ subject: string; university: string; count: number; created: boolean; error?: string }> = [];
    let total = 0;

    for (const g of groups.values()) {
        const uniName = uniRows.find((u) => u.id === g.uniId)?.name || '';
        const before = subjectCache.has(`${g.uniId}::${lower(g.subjectName)}`);
        try {
            const subjectId = await subjectFor(g.uniId, g.subjectName, g.semester);

            // Rebuild just this subject's rows into a workbook and hand it to the
            // same importer the per-subject upload uses.
            const ws = XLSX.utils.json_to_sheet(g.rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

            const { count } = await importQuestionBank({
                fileName: 'bulk.xlsx',
                arrayBuffer: buf,
                unitId: 'GLOBAL', // let the sheet's Unit column route rows
                subjectId,
            });
            total += count;
            results.push({ subject: g.subjectName, university: uniName, count, created: !before });
        } catch (e: any) {
            results.push({ subject: g.subjectName, university: uniName, count: 0, created: false, error: e?.body?.message || e?.message || 'Import failed' });
        }
    }

    return json({
        status: 'success',
        scope,
        total,
        subjects: results.sort((a, b) => b.count - a.count),
        unresolved,
        skipped,
    });
};
