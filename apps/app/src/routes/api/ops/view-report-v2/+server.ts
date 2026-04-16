/**
 * Preview endpoint for the v2 ops report template.
 * GET /api/ops/view-report-v2?type=daily|weekly|monthly&date=...&weekStart=...&weekEnd=...&year=...&month=...
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getOpsDailyReport,
    getOpsWeeklyReport,
    getOpsMonthlyReport
} from '@uniconnect/shared';
import { buildOpsReportV2 } from '$lib/email-templates/ops-report-v2';

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatRange(start: string, end: string): string {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
    if (!locals.user) throw error(401);

    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const type = (url.searchParams.get('type') || 'daily') as 'daily' | 'weekly' | 'monthly';

    let report: any;
    let periodLabel: string;
    let reportUrl: string;
    let prevSummary: any = null;

    if (type === 'weekly') {
        const weekStart = url.searchParams.get('weekStart');
        const weekEnd = url.searchParams.get('weekEnd');
        if (!weekStart || !weekEnd) throw error(400, 'weekStart and weekEnd required');
        report = await getOpsWeeklyReport(weekStart, weekEnd);
        periodLabel = formatRange(weekStart, weekEnd);
        reportUrl = `${origin}/api/ops/view-report-v2?type=weekly&weekStart=${weekStart}&weekEnd=${weekEnd}`;
        try {
            const prevStart = new Date(weekStart);
            prevStart.setDate(prevStart.getDate() - 7);
            const prevEnd = new Date(weekEnd);
            prevEnd.setDate(prevEnd.getDate() - 7);
            const prevReport = await getOpsWeeklyReport(
                prevStart.toISOString().split('T')[0],
                prevEnd.toISOString().split('T')[0]
            );
            prevSummary = prevReport?.summary || null;
        } catch {}
    } else if (type === 'monthly') {
        const year = parseInt(url.searchParams.get('year') || '0');
        const month = parseInt(url.searchParams.get('month') || '0');
        if (!year || !month) throw error(400, 'year and month required');
        report = await getOpsMonthlyReport(year, month);
        periodLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        reportUrl = `${origin}/api/ops/view-report-v2?type=monthly&year=${year}&month=${month}`;
        try {
            let pYear = year, pMonth = month - 1;
            if (pMonth === 0) { pMonth = 12; pYear = year - 1; }
            const prevReport = await getOpsMonthlyReport(pYear, pMonth);
            prevSummary = prevReport?.summary || null;
        } catch {}
    } else {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        report = await getOpsDailyReport(date);
        periodLabel = formatDate(date);
        reportUrl = `${origin}/api/ops/view-report-v2?type=daily&date=${date}`;
        try {
            const prev = new Date(date);
            prev.setDate(prev.getDate() - 1);
            const prevReport = await getOpsDailyReport(prev.toISOString().split('T')[0]);
            prevSummary = prevReport?.summary || null;
        } catch {}
    }

    const html = buildOpsReportV2({
        mode: type,
        periodLabel,
        report,
        aiSummary: '',
        dashboardUrl: `${origin}/ops-dashboard/v2`,
        reportUrl,
        prevSummary
    });

    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
};
