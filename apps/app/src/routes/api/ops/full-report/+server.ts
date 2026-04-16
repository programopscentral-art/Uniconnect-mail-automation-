/**
 * Standalone full-page HTML report.
 * Served from email "View Full Report" CTA — a wide, rich, print-friendly
 * version of the report, distinct from the compact email body.
 *
 * GET /api/ops/full-report?type=daily&date=YYYY-MM-DD
 * GET /api/ops/full-report?type=weekly&weekStart=YYYY-MM-DD&weekEnd=YYYY-MM-DD
 * GET /api/ops/full-report?type=monthly&year=YYYY&month=M
 * Optional: &university=NAME filters to a single university.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import {
    getOpsDailyReport, getOpsWeeklyReport, getOpsMonthlyReport
} from '@uniconnect/shared';
import { buildOpsFullReportHtml } from '$lib/email-templates/ops-full-report';

async function generateAISummaryForReport(report: any, type: string): Promise<string> {
    const apiKey = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) return '';
    const s = report.summary || {};
    const n = (v: any) => parseInt(v) || 0;
    const byUniv = (report.byUniversity || []).slice(0, 20).map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)} (${uSess}%), Attendance ${uAtt}%, At-Risk ${n(r.at_risk_total)}${r.cancellation_reason ? `, Notes: ${r.cancellation_reason}` : ''}`;
    }).join('\n');

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const prompt = `Generate a concise executive summary (5-7 paragraphs, under 400 words) for UniConnect ${type} ops report.

Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
At-Risk: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed
Events: ${n(s.events_executed)}/${n(s.events_planned)}

Universities:
${byUniv || 'No data'}

Professional tone. Cover overall health, top/bottom performers, at-risk follow-up, coach call coverage, and 3 specific action items for management. Plain text paragraphs only.`;

    for (const model of ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash']) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 2048, temperature: 0.2 }
                    })
                }
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch { continue; }
    }
    return '';
}

export const GET: RequestHandler = async ({ url, request }) => {
    const type = (url.searchParams.get('type') || 'daily') as 'daily' | 'weekly' | 'monthly';
    const univFilter = url.searchParams.get('university') || null;

    let report: any;
    let periodLabel = '';
    let prevSummary: any = null;

    if (type === 'weekly') {
        const weekStart = url.searchParams.get('weekStart');
        const weekEnd = url.searchParams.get('weekEnd');
        if (!weekStart || !weekEnd) throw error(400, 'weekStart and weekEnd required');
        report = await getOpsWeeklyReport(weekStart, weekEnd);
        periodLabel = `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        try {
            const ps = new Date(weekStart); ps.setDate(ps.getDate() - 7);
            const pe = new Date(weekEnd); pe.setDate(pe.getDate() - 7);
            const prev = await getOpsWeeklyReport(ps.toISOString().split('T')[0], pe.toISOString().split('T')[0]);
            prevSummary = prev?.summary || null;
        } catch {}
    } else if (type === 'monthly') {
        const year = parseInt(url.searchParams.get('year') || '0');
        const month = parseInt(url.searchParams.get('month') || '0');
        if (!year || !month) throw error(400, 'year and month required');
        report = await getOpsMonthlyReport(year, month);
        periodLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        try {
            let pYear = year, pMonth = month - 1;
            if (pMonth === 0) { pMonth = 12; pYear = year - 1; }
            const prev = await getOpsMonthlyReport(pYear, pMonth);
            prevSummary = prev?.summary || null;
        } catch {}
    } else {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        report = await getOpsDailyReport(date);
        periodLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
            const prev = new Date(date); prev.setDate(prev.getDate() - 1);
            const prevReport = await getOpsDailyReport(prev.toISOString().split('T')[0]);
            prevSummary = prevReport?.summary || null;
        } catch {}
    }

    if (univFilter) {
        const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const nf = norm(univFilter);
        const filterRow = (r: any) => {
            const rn = norm(r.university_name);
            return rn.includes(nf) || nf.includes(rn);
        };
        report = {
            ...report,
            byUniversity: (report.byUniversity || []).filter(filterRow),
            teamActivity: (report.teamActivity || []).filter(filterRow),
        };
    }

    const aiSummary = await generateAISummaryForReport(report, type);
    const origin = request.headers.get('origin') || new URL(request.url).origin;

    const html = buildOpsFullReportHtml({
        mode: type,
        periodLabel,
        report,
        aiSummary,
        dashboardUrl: `${origin}/ops-dashboard/v2`,
        prevSummary
    });

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
};
