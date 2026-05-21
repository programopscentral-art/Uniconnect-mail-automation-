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
    const body = contentType.includes('multipart/form-data') ? null : await request.json();

    // ── MULTI-TAB MODE: loop through several per-university tabs ──
    // body: { period_id, mode: 'multi-tab', sheet_id, tabs: [{name, university_name}, ...] }
    if (body?.mode === 'multi-tab') {
        if (!body.period_id || !body.sheet_id || !Array.isArray(body.tabs)) {
            throw error(400, 'period_id, sheet_id, and tabs[] required for multi-tab mode');
        }
        const t0 = Date.now();
        const perTab: any[] = [];
        let totalOk = 0, totalSkipped = 0, totalCreated = 0, totalTagged = 0;
        const allErrors: string[] = [];
        const allCreatedUnis: string[] = [];

        for (const tab of body.tabs) {
            const tabName = typeof tab === 'string' ? tab : tab.name;
            const forcedUniName = typeof tab === 'string' ? tab : (tab.university_name || tab.name);
            try {
                const tabRows = await fetchSheetTab(body.sheet_id, tabName);
                const result = await importUserwiseRows(body.period_id, tabRows, locals.user!.id, {
                    importRemarks: !!body.import_remarks,
                    forcedUniversityName: forcedUniName,
                });
                totalOk += result.ok;
                totalSkipped += result.skipped;
                totalCreated += result.createdUniversities.length;
                totalTagged += result.tagged;
                allErrors.push(...result.errors.slice(0, 3).map((e: string) => `[${tabName}] ${e}`));
                allCreatedUnis.push(...result.createdUniversities);
                perTab.push({ tab: tabName, university: forcedUniName, ok: result.ok, skipped: result.skipped, rows: tabRows.length });
            } catch (e: any) {
                allErrors.push(`[${tabName}] Failed to fetch: ${e.message?.slice(0, 80)}`);
                perTab.push({ tab: tabName, university: forcedUniName, ok: 0, skipped: 0, error: e.message });
            }
        }

        return json({
            mode: 'multi-tab',
            ok: totalOk,
            skipped: totalSkipped,
            tagged: totalTagged,
            createdUniversities: allCreatedUnis,
            errors: allErrors,
            perTab,
            tabs_processed: body.tabs.length,
            elapsed_ms: Date.now() - t0,
        });
    }

    // ── SINGLE-TAB MODE (existing flow) ──
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
