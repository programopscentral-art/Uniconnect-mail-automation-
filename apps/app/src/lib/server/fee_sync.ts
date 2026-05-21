/**
 * Fee Collection — sync orchestrator.
 *
 * Runs a full sync of a period's data from its configured Google Sheet.
 * Used by:
 *   - Manual "Sync Now" button (/api/fees/periods/[id]/sync)
 *   - Worker's auto-sync loop (every minute, fires for periods due)
 */
import {
    recordSyncResult,
    bulkUpsertFeeStudentPayments,
    aggregateTransactionsToDailyLog,
} from '@uniconnect/shared';
import {
    fetchSheetTab,
    importUserwiseRows,
    importDayWisePayments,
    importUniversitySummary,
    autoMergeAliasDuplicates,
} from './fee_import';

export interface SheetTabsConfig {
    userwise_tab?: string;
    daywise_tab?: string;
    summary_tab?: string;
    multi_tabs?: string[];
}

export interface SyncResult {
    success: boolean;
    error?: string;
    elapsed_ms: number;
    perStep: Array<{
        step: string;
        tab?: string;
        ok: number;
        skipped: number;
        errors?: string[];
    }>;
    totalImported: number;
    totalSkipped: number;
    createdUniversities: string[];
}

export async function runFullSync(period: {
    id: string;
    sheet_id: string;
    sheet_tabs_config: SheetTabsConfig;
}, userId?: string): Promise<SyncResult> {
    const t0 = Date.now();
    const cfg = period.sheet_tabs_config || {};
    const perStep: SyncResult['perStep'] = [];
    const createdUniversities: string[] = [];
    let totalImported = 0;
    let totalSkipped = 0;
    let error: string | undefined;

    try {
        // 0. Auto-merge alias-duplicate universities (e.g. "Mallareddy" + "MRV")
        //    so we start with a clean university list before importing new rows.
        try {
            const result = await autoMergeAliasDuplicates();
            if (result.merged.length > 0 || result.failed.length > 0) {
                perStep.push({
                    step: 'auto-merge',
                    ok: result.merged.length,
                    skipped: result.failed.length,
                    errors: [
                        ...result.merged.map(m => `Merged "${m.from}" → "${m.to}"`),
                        ...result.failed.map(f => `Failed "${f.from}" → "${f.to}": ${f.error}`),
                    ],
                });
            }
        } catch (e: any) {
            perStep.push({ step: 'auto-merge', ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
        }

        // 1. Main student data
        if (cfg.userwise_tab) {
            try {
                const rows = await fetchSheetTab(period.sheet_id, cfg.userwise_tab);
                const res = await importUserwiseRows(period.id, rows, userId);
                perStep.push({ step: 'userwise', tab: cfg.userwise_tab, ok: res.ok, skipped: res.skipped, errors: res.errors });
                totalImported += res.ok;
                totalSkipped += res.skipped;
                createdUniversities.push(...res.createdUniversities);
            } catch (e: any) {
                perStep.push({ step: 'userwise', tab: cfg.userwise_tab, ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
            }
        }

        // 2. Multi-tab (per-university)
        if (cfg.multi_tabs && cfg.multi_tabs.length > 0) {
            for (const tabName of cfg.multi_tabs) {
                try {
                    const rows = await fetchSheetTab(period.sheet_id, tabName);
                    const uniName = tabName.replace(/\s*University\s*$/i, '').replace(/_Import$/i, '').replace(/\s+userwise data$/i, '').trim();
                    const res = await importUserwiseRows(period.id, rows, userId, { forcedUniversityName: uniName });
                    perStep.push({ step: 'multi-tab', tab: tabName, ok: res.ok, skipped: res.skipped, errors: res.errors });
                    totalImported += res.ok;
                    totalSkipped += res.skipped;
                    createdUniversities.push(...res.createdUniversities);
                } catch (e: any) {
                    perStep.push({ step: 'multi-tab', tab: tabName, ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
                }
            }
        }

        // 3. Daily payment transactions
        if (cfg.daywise_tab) {
            try {
                const rows = await fetchSheetTab(period.sheet_id, cfg.daywise_tab);
                const res = await importDayWisePayments(period.id, rows);
                perStep.push({ step: 'daywise', tab: cfg.daywise_tab, ok: res.ok, skipped: res.skipped, errors: res.errors });
                totalImported += res.ok;
                totalSkipped += res.skipped;
            } catch (e: any) {
                perStep.push({ step: 'daywise', tab: cfg.daywise_tab, ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
            }
        }

        // 4. University summary
        if (cfg.summary_tab) {
            try {
                const rows = await fetchSheetTab(period.sheet_id, cfg.summary_tab);
                const res = await importUniversitySummary(period.id, rows);
                perStep.push({ step: 'summary', tab: cfg.summary_tab, ok: res.ok, skipped: res.skipped, errors: res.errors });
                totalImported += res.ok;
                totalSkipped += res.skipped;
                createdUniversities.push(...res.createdUniversities);
            } catch (e: any) {
                perStep.push({ step: 'summary', tab: cfg.summary_tab, ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
            }
        }

        // 5. Aggregate transactions → daily collection log (powers Daily Report tab)
        try {
            const aggRows = await aggregateTransactionsToDailyLog(period.id);
            perStep.push({ step: 'aggregate-daily-log', ok: aggRows, skipped: 0 });
        } catch (e: any) {
            perStep.push({ step: 'aggregate-daily-log', ok: 0, skipped: 0, errors: [e.message?.slice(0, 200)] });
        }

    } catch (e: any) {
        error = e.message || String(e);
    }

    const result: SyncResult = {
        success: !error,
        error,
        elapsed_ms: Date.now() - t0,
        perStep,
        totalImported,
        totalSkipped,
        createdUniversities: Array.from(new Set(createdUniversities)),
    };

    // Persist result on the period row so dashboard can show "Last synced X ago"
    await recordSyncResult(period.id, result, error || null).catch(() => {});

    return result;
}

// Suppress unused-import warning for re-export consumers
export { bulkUpsertFeeStudentPayments };
