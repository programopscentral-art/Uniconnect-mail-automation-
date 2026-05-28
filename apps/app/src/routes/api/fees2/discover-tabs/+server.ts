/**
 * GET /api/fees2/discover-tabs?sheet_id=...
 *
 * Discovers every tab in the given public Google Sheet and classifies them
 * for the fee-collection-v2 setup modal:
 *   - batchTabs: name matches `<YYYY>-Semester <N>` (auto-fills the
 *     "Batch sub-sheets" textarea)
 *   - datesTab: name matches `dates?` (often "semester 3 dates")
 *   - dropoutTab: name matches `dropout`
 *
 * Also flags any batch whose (batch_start_year) already has fee_batch_period
 * rows in the DB from a prior window, so the UI can say
 *   "Batch 2022 — already tracked in 2 previous windows; will continue here"
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import { discoverSheetTabs } from '$lib/server/sheet_tabs';

const BATCH_TAB_RE = /^\s*(\d{4})\s*[-–]\s*Semester\s*(\d+)\s*$/i;
const DATES_RE = /^\s*(semester\s*\d*\s*)?dates?\s*$/i;
const DROPOUT_RE = /^\s*dropouts?\s*$/i;

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const sheetId = (url.searchParams.get('sheet_id') || '').trim();
    if (!sheetId) throw error(400, 'sheet_id required');

    const tabs = await discoverSheetTabs(sheetId);

    const batches: Array<{ name: string; gid: string; batch_start_year: number; semester_number: number; existing_windows: number }> = [];
    let datesTab: string | null = null;
    let dropoutTab: string | null = null;

    for (const t of tabs) {
        const bm = t.name.match(BATCH_TAB_RE);
        if (bm) {
            batches.push({
                name: t.name,
                gid: t.gid,
                batch_start_year: parseInt(bm[1], 10),
                semester_number: parseInt(bm[2], 10),
                existing_windows: 0,
            });
        } else if (!datesTab && DATES_RE.test(t.name)) {
            datesTab = t.name;
        } else if (!dropoutTab && DROPOUT_RE.test(t.name)) {
            dropoutTab = t.name;
        }
    }

    // Annotate each batch with how many other windows already track this batch_start_year
    if (batches.length > 0) {
        const years = Array.from(new Set(batches.map(b => b.batch_start_year)));
        const r = await db.query(
            `SELECT batch_start_year, COUNT(DISTINCT window_id)::int AS n
               FROM fee_batch_period
              WHERE batch_start_year = ANY($1::int[])
              GROUP BY batch_start_year`,
            [years],
        );
        const seen = new Map<number, number>(r.rows.map((row: { batch_start_year: number; n: number }) => [row.batch_start_year, Number(row.n)]));
        for (const b of batches) b.existing_windows = seen.get(b.batch_start_year) ?? 0;
    }

    batches.sort((a, b) => a.batch_start_year - b.batch_start_year || a.semester_number - b.semester_number);

    return json({
        sheet_id: sheetId,
        total_tabs: tabs.length,
        batches,
        dates_tab: datesTab,
        dropout_tab: dropoutTab,
        all_tabs: tabs.map(t => t.name),
    });
};
