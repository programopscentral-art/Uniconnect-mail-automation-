/**
 * POST /api/assessments/portion/import
 *   body: { sheet_url|sheet_id, semester, dry_run,
 *           university_ids?: string[]   // restrict the load to these universities
 *           create_missing?: boolean }  // create the subject where a scoped
 *                                       // university does not have it yet
 *   → Import the exam PORTION (modules/topics/sessions) from a Google Sheet
 *     into matching subjects across all universities. dry_run=true previews
 *     the counts without writing.
 *
 * Allowed: ADMIN / PROGRAM_OPS / SME (content owners who manage examinations).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importPortion } from '$lib/server/portion_import';

const ALLOWED = ['ADMIN', 'PROGRAM_OPS', 'SME'];

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!ALLOWED.includes(locals.user.role as string)) {
        throw error(403, 'Only Admin / Program Ops / SME can load exam portion.');
    }
    const body = await request.json().catch(() => ({}));
    const sheet = String(body.sheet_url ?? body.sheet_id ?? '').trim();
    const semester = Number(body.semester);
    const dryRun = body.dry_run !== false; // default to preview
    const universityIds: string[] = Array.isArray(body.university_ids)
        ? body.university_ids.map((x: unknown) => String(x)).filter(Boolean)
        : [];
    const createMissing = body.create_missing === true;

    if (!sheet) throw error(400, 'sheet_url (or sheet_id) is required');
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) throw error(400, 'semester must be 1–8');

    try {
        const result = await importPortion(sheet, semester, dryRun, { universityIds, createMissing });
        return json(result);
    } catch (e: any) {
        console.error('[PORTION_IMPORT] failed:', e?.message);
        throw error(500, e?.message || 'Portion import failed');
    }
};
