import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkFeeAccess } from '$lib/server/fee_access';
import {
    importUserwiseRows,
    importDayWisePayments,
    importUniversitySummary,
    fetchSheetTab,
    parseCSV,
} from '$lib/server/fee_import';

/**
 * Universal import endpoint. Two modes:
 *
 * 1) Google Sheets sync — JSON body:
 *      { period_id, mode: 'sheet', sheet_id, tab_name, dataset: 'userwise'|'daywise'|'summary' }
 *
 * 2) CSV upload — multipart form-data:
 *      file=<csv>  period_id=<uuid>  dataset=userwise|daywise|summary
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    checkFeeAccess(locals, 'admin');
    const contentType = request.headers.get('content-type') || '';

    let periodId = ''; let dataset = 'userwise'; let rows: any[] = []; let importRemarks = false;

    if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        periodId = String(form.get('period_id') || '');
        dataset = String(form.get('dataset') || 'userwise');
        importRemarks = form.get('import_remarks') === 'true';
        const file = form.get('file') as File;
        if (!file) throw error(400, 'No file uploaded');
        const text = await file.text();
        rows = parseCSV(text);
    } else {
        const body = await request.json();
        periodId = body.period_id;
        dataset = body.dataset || 'userwise';
        importRemarks = !!body.import_remarks;
        if (body.mode === 'sheet') {
            if (!body.sheet_id || !body.tab_name) throw error(400, 'sheet_id and tab_name required');
            try {
                rows = await fetchSheetTab(body.sheet_id, body.tab_name);
            } catch (e: any) {
                throw error(400, `Failed to fetch sheet: ${e.message}. Make sure the sheet is public (Anyone with link → Viewer).`);
            }
        } else if (Array.isArray(body.rows)) {
            rows = body.rows;
        } else {
            throw error(400, 'Provide either mode=sheet+sheet_id+tab_name, or rows[], or use multipart CSV upload');
        }
    }

    if (!periodId) throw error(400, 'period_id required');
    if (!rows.length) return json({ ok: 0, skipped: 0, message: 'No rows found' });

    const t0 = Date.now();
    let result: any;
    if (dataset === 'userwise') {
        result = await importUserwiseRows(periodId, rows, locals.user!.id, { importRemarks });
    } else if (dataset === 'daywise') {
        result = await importDayWisePayments(periodId, rows);
    } else if (dataset === 'summary') {
        result = await importUniversitySummary(periodId, rows);
    } else {
        throw error(400, `Unknown dataset: ${dataset}`);
    }
    const elapsedMs = Date.now() - t0;

    return json({ ...result, total_rows: rows.length, dataset, elapsed_ms: elapsedMs });
};
