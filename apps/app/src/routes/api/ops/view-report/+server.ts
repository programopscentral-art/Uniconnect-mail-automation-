import {
    getOpsDailyReport, getOpsWeeklyReport, getOpsMonthlyReport,
} from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { buildOpsReportV2 } from '$lib/email-templates/ops-report-v2';

// ─── Public endpoint: serves full HTML reports for email CTA links ──────────
// No auth required — linked directly from email "Open Full Report" buttons.
// Usage:
//   /api/ops/view-report?type=daily&date=2026-04-07
//   /api/ops/view-report?type=weekly&weekStart=2026-03-30&weekEnd=2026-04-05
//   /api/ops/view-report?type=monthly&year=2026&month=3

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

    const periodInfo = type === 'weekly' ? `Week: ${report.weekStart} to ${report.weekEnd}` :
        type === 'monthly' ? `Month: ${new Date(report.year, (report.month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` :
        `Date: ${report.date}`;

    const prompt = `Generate a concise executive summary (5-7 paragraphs, under 400 words) for UniConnect ${type} ops report.

${periodInfo}
Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
At-Risk: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed
Events: ${n(s.events_executed)}/${n(s.events_planned)}

Universities:
${byUniv || 'No data'}

Professional tone. Cover overall health, top/bottom performers, at-risk follow-up, coach call coverage, and 3 specific action items for management. Plain text paragraphs only — no markdown, no bullet points.`;

    for (const model of ['gemini-2.5-flash']) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 2048, temperature: 0.2 } })
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
    const type = url.searchParams.get('type') || 'daily';
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const univFilter = url.searchParams.get('university') || null;
    // template=classic for the legacy report; otherwise v2 is the default.
    const template = (url.searchParams.get('template') || 'v2').toLowerCase();

    let report: any;
    let prevSummary: any = null;
    let periodLabel = '';
    let weekStart = ''; let weekEnd = '';
    let year = 0; let month = 0;

    if (type === 'weekly') {
        // Accept both weekStart/weekEnd (canonical) and start/end (legacy aliases used in older emails)
        weekStart = url.searchParams.get('weekStart') || url.searchParams.get('start') || '';
        weekEnd = url.searchParams.get('weekEnd') || url.searchParams.get('end') || '';
        if (!weekStart || !weekEnd) throw error(400, 'weekStart and weekEnd required for weekly reports');
        report = await getOpsWeeklyReport(weekStart, weekEnd);
        try {
            const ps = new Date(weekStart); ps.setDate(ps.getDate() - 7);
            const pe = new Date(weekEnd); pe.setDate(pe.getDate() - 7);
            const prev = await getOpsWeeklyReport(
                ps.toISOString().split('T')[0], pe.toISOString().split('T')[0]
            );
            prevSummary = prev?.summary || null;
        } catch {}
        periodLabel = `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (type === 'monthly') {
        year = parseInt(url.searchParams.get('year') || '');
        month = parseInt(url.searchParams.get('month') || '');
        if (!year || !month) throw error(400, 'year and month required for monthly reports');
        report = await getOpsMonthlyReport(year, month);
        try {
            let pYear = year, pMonth = month - 1;
            if (pMonth === 0) { pMonth = 12; pYear = year - 1; }
            const prev = await getOpsMonthlyReport(pYear, pMonth);
            prevSummary = prev?.summary || null;
        } catch {}
        periodLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } else {
        report = await getOpsDailyReport(date);
        try {
            const prev = new Date(date); prev.setDate(prev.getDate() - 1);
            const prevReport = await getOpsDailyReport(prev.toISOString().split('T')[0]);
            prevSummary = prevReport?.summary || null;
        } catch {}
        periodLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Filter to a single university when ?university= param is provided
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

    let html: string;
    if (template === 'classic') {
        html = generateReportHTML(report, type, aiSummary, univFilter || undefined);
    } else {
        const origin = request.headers.get('origin') || new URL(request.url).origin;
        const reportUrl = new URL(request.url).toString();
        html = buildOpsReportV2({
            mode: type as any,
            periodLabel,
            report,
            aiSummary,
            dashboardUrl: `${origin}/ops-dashboard/v2`,
            reportUrl,
            prevSummary
        });
    }

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
};

// ─── Full report HTML generator (ported from client-side ops-dashboard) ─────

function generateReportHTML(report: any, type: string, aiSummary = '', univFilter?: string): string {
    const periodLabel = type === 'daily' ? report.date :
        type === 'weekly' ? `${report.weekStart} to ${report.weekEnd}` :
        `${new Date(report.year, (report.month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
    const title = type === 'daily' ? `Daily Operations Report — ${formatReportDate(report.date)}` :
        type === 'weekly' ? `Weekly Operations Report — ${formatReportDate(report.weekStart)} to ${formatReportDate(report.weekEnd)}` :
        `Monthly Operations Report — ${new Date(report.year, (report.month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

    function toDateStr(d: any): string {
        if (!d) return '';
        if (d instanceof Date) return d.toISOString().split('T')[0];
        const s = String(d);
        if (s.includes('T')) return s.split('T')[0];
        return s;
    }
    function formatReportDate(d: any) {
        try { const ds = toDateStr(d); if (!ds) return '—'; return new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch { return String(d); }
    }
    function formatShortDate(d: any) {
        try { const ds = toDateStr(d); if (!ds) return '—'; return new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return String(d); }
    }

    const s = report.summary || {};
    const rawByUniv = report.byUniversity || [];
    const rawDaily = report.dailyBreakdown || [];
    const rawTeamActivity = report.teamActivity || [];

    const n = (v: any) => parseInt(v) || 0;
    const f = (v: any) => parseFloat(v) || 0;

    // ── DEDUPLICATE universities by normalizing names ──
    const UNIV_ALIASES: Record<string, string> = {
        'chalapathy': 'chalapathi', 'chalapathi': 'chalapathi',
        'cresent': 'crescent', 'crescent': 'crescent',
        'cietcity': 'cietcity', 'cityciet': 'cietcity',
        'yenapoya': 'yenapoya', 'yenepoya': 'yenapoya',
        'academy': 'amet', 'amet': 'amet',
        'adypatil': 'adypu', 'adypu': 'adypu',
        'mallareddy': 'mrv', 'mrv': 'mrv',
        'noidaint': 'niu', 'niu': 'niu',
        'nriit': 'nri', 'nri': 'nri',
        'kkh': 'kkh',
    };
    function normalizeUnivName(name: string) {
        const lower = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (UNIV_ALIASES[lower]) return UNIV_ALIASES[lower];
        const sorted = (name || '').trim().toLowerCase().split(/[\/\-\s]+/).filter(Boolean).sort().join('');
        return sorted || lower;
    }
    function mergeUnivRows(rows: any[]) {
        const merged = new Map<string, any>();
        for (const r of rows) {
            const key = normalizeUnivName(r.university_name);
            if (!key) continue;
            if (merged.has(key)) {
                const existing = merged.get(key)!;
                for (const k of Object.keys(r)) {
                    if (k === 'university_name') continue;
                    const val = typeof r[k] === 'number' || (typeof r[k] === 'string' && /^\d+$/.test(r[k])) ? n(r[k]) : 0;
                    const exVal = typeof existing[k] === 'number' || (typeof existing[k] === 'string' && /^\d+$/.test(existing[k])) ? n(existing[k]) : 0;
                    if (val || exVal) existing[k] = exVal + val;
                }
            } else {
                merged.set(key, { ...r });
            }
        }
        return Array.from(merged.values()).sort((a, b) => (a.university_name || '').localeCompare(b.university_name || ''));
    }
    const byUniv = mergeUnivRows(rawByUniv);
    const teamActivity = mergeUnivRows(rawTeamActivity);

    // Recalculate summary totals from deduplicated data
    const totalSessionsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.sessions_planned), 0);
    const totalSessionsCompleted = byUniv.reduce((s: number, r: any) => s + n(r.sessions_completed), 0);
    const totalSessionsCancelled = byUniv.reduce((s: number, r: any) => s + n(r.sessions_cancelled), 0);
    const totalEnrolled = byUniv.reduce((s: number, r: any) => s + n(r.enrolled), 0);
    const totalAttended = byUniv.reduce((s: number, r: any) => s + n(r.attended), 0);
    const totalAbsent = totalEnrolled - totalAttended;
    const totalCoachCalls = byUniv.reduce((s: number, r: any) => s + n(r.coach_calls), 0);
    const totalParentCalls = byUniv.reduce((s: number, r: any) => s + n(r.parent_calls), 0);
    const totalAtRisk = byUniv.reduce((s: number, r: any) => s + n(r.at_risk_total), 0);
    const totalAtRiskInformed = byUniv.reduce((s: number, r: any) => s + n(r.at_risk_informed), 0);
    const totalEventsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.events_planned), 0);
    const totalEventsExecuted = byUniv.reduce((s: number, r: any) => s + n(r.events_executed), 0);
    const totalEventsCancelled = byUniv.reduce((s: number, r: any) => s + n(r.events_cancelled), 0);
    const totalExamsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.exams_planned), 0);
    const totalExamsCompleted = Math.min(byUniv.reduce((s: number, r: any) => s + n(r.exams_completed), 0), totalExamsPlanned);

    const sessRate = totalSessionsPlanned > 0 ? Math.round((totalSessionsCompleted / totalSessionsPlanned) * 100) : 0;
    const attRate = totalEnrolled > 0 ? Math.round((totalAttended / totalEnrolled) * 100) : 0;
    const coachRate = totalAbsent > 0 ? Math.min(Math.round((totalCoachCalls / totalAbsent) * 100), 100) : 0;
    const parentRate = totalAbsent > 0 ? Math.min(Math.round((totalParentCalls / totalAbsent) * 100), 100) : 0;
    const eventExecRate = totalEventsPlanned > 0 ? Math.round((totalEventsExecuted / totalEventsPlanned) * 100) : 0;
    const examRate = totalExamsPlanned > 0 ? Math.min(Math.round((totalExamsCompleted / totalExamsPlanned) * 100), 100) : 0;
    const atRiskInformedRate = totalAtRisk > 0 ? Math.round((totalAtRiskInformed / totalAtRisk) * 100) : 0;

    const rateColor = (v: number) => v >= 80 ? '#16a34a' : v >= 50 ? '#ca8a04' : '#dc2626';

    // ── SVG Chart Helpers ──
    function svgDonut(percent: number, label: string, color: string, size = 100) {
        const r = size * 0.38; const cx = size / 2; const cy = size / 2;
        const circ = 2 * Math.PI * r;
        const p = Math.min(Math.max(percent, 0), 100);
        return `<svg width="${size}" height="${size + 20}" viewBox="0 0 ${size} ${size + 20}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="8"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${circ * p / 100} ${circ * (100 - p) / 100}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
            <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="16" font-weight="800" fill="${color}">${p}%</text>
            <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="8" fill="#94a3b8">${label}</text>
        </svg>`;
    }
    function svgBar(bars: {label: string; value: number; color: string}[], height = 120) {
        if (!bars.length) return '';
        const w = 400; const barW = Math.min(40, (w - 40) / bars.length - 8);
        const maxVal = Math.max(...bars.map(b => b.value), 1);
        const barsHtml = bars.map((b, i) => {
            const bh = Math.max(2, (b.value / maxVal) * (height - 30));
            const x = 20 + i * ((w - 40) / bars.length) + ((w - 40) / bars.length - barW) / 2;
            return `<rect x="${x}" y="${height - 20 - bh}" width="${barW}" height="${bh}" rx="3" fill="${b.color}" opacity="0.85"/>
                <text x="${x + barW / 2}" y="${height - 24 - bh}" text-anchor="middle" font-size="9" fill="#374151" font-weight="600">${b.value}</text>
                <text x="${x + barW / 2}" y="${height - 4}" text-anchor="middle" font-size="8" fill="#94a3b8">${b.label}</text>`;
        }).join('');
        return `<svg width="100%" viewBox="0 0 ${w} ${height}">${barsHtml}</svg>`;
    }
    function svgHBar(items: {label: string; value: number; max: number; color: string}[]) {
        if (!items.length) return '';
        const h = items.length * 28 + 10;
        const maxVal = Math.max(...items.map(i => i.max), 1);
        const rows = items.map((item, i) => {
            const y = 8 + i * 28; const bw = Math.max(2, (item.value / maxVal) * 240);
            return `<text x="0" y="${y + 14}" font-size="10" fill="#374151" font-weight="500">${item.label}</text>
                <rect x="130" y="${y + 2}" width="${bw}" height="16" rx="3" fill="${item.color}" opacity="0.8"/>
                <text x="${132 + bw + 4}" y="${y + 14}" font-size="9" fill="#64748b" font-weight="600">${item.value}/${item.max}</text>`;
        }).join('');
        return `<svg width="100%" viewBox="0 0 420 ${h}">${rows}</svg>`;
    }

    // ── University Breakdown Table ──
    const univRows = byUniv.map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        const uAbsent = n(r.enrolled) - n(r.attended);
        const uCoachRate = uAbsent > 0 ? Math.min(Math.round((n(r.coach_calls) / uAbsent) * 100), 100) : 0;
        return `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.university_name}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.sessions_planned)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${rateColor(uSess)}">${n(r.sessions_completed)} <span style="font-size:10px;color:#999">(${uSess}%)</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626">${n(r.sessions_cancelled)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.enrolled)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${rateColor(uAtt)}">${n(r.attended)} <span style="font-size:10px;color:#999">(${uAtt}%)</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#64748b">${uAbsent}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${rateColor(uCoachRate)}">${n(r.coach_calls)} <span style="font-size:10px;color:#999">(${uCoachRate}%)</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.parent_calls)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${n(r.at_risk_total) > 0 ? '#dc2626' : '#16a34a'};font-weight:600">${n(r.at_risk_total)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.at_risk_informed)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.instructors_total)} <span style="font-size:10px;color:#dc2626">(${n(r.instructors_on_leave)} leave)</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.events_executed)}/${n(r.events_planned)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${Math.min(n(r.exams_completed), n(r.exams_planned))}/${n(r.exams_planned)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.post_exam_comms_sent)}</td>
        </tr>`;
    }).join('');

    const totalRow = byUniv.length > 1 ? `<tr style="background:#f0f4ff;font-weight:700">
        <td style="padding:10px 12px;border-top:2px solid #6366f1">TOTAL (${byUniv.length} universities)</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalSessionsPlanned}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(sessRate)}">${totalSessionsCompleted} (${sessRate}%)</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${totalSessionsCancelled}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalEnrolled}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(attRate)}">${totalAttended} (${attRate}%)</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalAbsent}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalCoachCalls}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalParentCalls}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${totalAtRisk}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalAtRiskInformed}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.instructors_total)}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalEventsExecuted}/${totalEventsPlanned}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalExamsCompleted}/${totalExamsPlanned}</td>
        <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.post_exam_comms_sent)}</td>
    </tr>` : '';

    // ── Team Activity Section ──
    let teamSection = '';
    if (teamActivity.length > 0 && teamActivity.some((r: any) => n(r.instructors_active) + n(r.coaches_active) + n(r.program_ops_active) + n(r.total_calls_made) > 0)) {
        const totalInstructorsActive = teamActivity.reduce((s: number, r: any) => s + n(r.instructors_active), 0);
        const totalCoachesActive = teamActivity.reduce((s: number, r: any) => s + n(r.coaches_active), 0);
        const totalOpsActive = teamActivity.reduce((s: number, r: any) => s + n(r.program_ops_active), 0);
        const totalCalls = teamActivity.reduce((s: number, r: any) => s + n(r.total_calls_made), 0);
        const totalTickets = teamActivity.reduce((s: number, r: any) => s + n(r.tickets_resolved), 0);
        const totalClicks = teamActivity.reduce((s: number, r: any) => s + n(r.clicks_shares_sent), 0);
        const avgInstrHrs = teamActivity.length > 0 ? (teamActivity.reduce((s: number, r: any) => s + f(r.avg_hours_instructors), 0) / teamActivity.length).toFixed(1) : '0';
        const avgCoachHrs = teamActivity.length > 0 ? (teamActivity.reduce((s: number, r: any) => s + f(r.avg_hours_coaches), 0) / teamActivity.length).toFixed(1) : '0';

        teamSection = `
        <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Staff Activity &amp; Productivity</h2>
        <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Active staff counts and work output per university. Tasks counted from the UniConnect system (completed by 6:30 PM IST). Program Ops Staff = COs, PMs, and ops managers.</p>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:16px">
            <div class="kpi"><div class="label">Instructors</div><div class="value blue">${totalInstructorsActive}</div><div class="sub">Avg ${avgInstrHrs}h/day</div></div>
            <div class="kpi"><div class="label">Coaches (CMAs)</div><div class="value purple">${totalCoachesActive}</div><div class="sub">Avg ${avgCoachHrs}h/day</div></div>
            <div class="kpi"><div class="label">Program Ops Staff</div><div class="value" style="color:#0891b2">${totalOpsActive}</div><div class="sub">COs, PMs &amp; Ops Managers</div></div>
        </div>
        <div class="table-wrap"><table>
            <thead><tr>
                <th style="text-align:left">University</th>
                <th>Instructors</th><th>Coaches</th><th>Program Ops Staff</th>
                <th>Outreach Calls</th><th>Tasks Done (till 6:30 PM)</th><th>Clicks/Shares</th>
                <th>Instr. Hrs</th><th>Coach Hrs</th><th>Ops Hrs</th>
            </tr></thead><tbody>` +
        teamActivity.filter((r: any) => n(r.instructors_active) + n(r.coaches_active) + n(r.program_ops_active) > 0).map((r: any) => `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.university_name}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.instructors_active)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.coaches_active)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.program_ops_active)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${n(r.total_calls_made)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;font-weight:600">${n(r.tickets_resolved)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.clicks_shares_sent)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_instructors).toFixed(1)}h</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_coaches).toFixed(1)}h</td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_program_ops).toFixed(1)}h</td>
        </tr>`).join('') +
        `</tbody></table></div>`;
    }

    // ── Daily Breakdown (for weekly/monthly) ──
    let dailySection = '';
    if (type !== 'daily') {
        const dailyByDate = new Map<string, any>();
        for (const row of rawDaily) {
            const d = toDateStr(row.date);
            if (!dailyByDate.has(d)) {
                dailyByDate.set(d, { sessions_planned: 0, sessions_completed: 0, sessions_cancelled: 0, enrolled: 0, attended: 0, coach_calls: 0, parent_calls: 0, at_risk_total: 0, events_planned: 0, events_executed: 0, exams_planned: 0, exams_completed: 0, instructors_on_leave: 0, univCount: 0 });
            }
            const agg = dailyByDate.get(d)!;
            agg.sessions_planned += n(row.sessions_planned);
            agg.sessions_completed += n(row.sessions_completed);
            agg.sessions_cancelled += n(row.sessions_cancelled);
            agg.enrolled += n(row.enrolled);
            agg.attended += n(row.attended);
            agg.coach_calls += n(row.coach_calls);
            agg.parent_calls += n(row.parent_calls);
            agg.at_risk_total += n(row.at_risk_total);
            agg.events_planned += n(row.events_planned);
            agg.events_executed += n(row.events_executed);
            agg.exams_planned += n(row.exams_planned);
            agg.exams_completed += n(row.exams_completed);
            agg.instructors_on_leave += n(row.instructors_on_leave);
            agg.univCount++;
        }

        const rangeStart = type === 'weekly' ? report.weekStart : report.startDate;
        const rangeEnd = type === 'weekly' ? report.weekEnd : report.endDate;
        const allDates: string[] = [];
        if (rangeStart && rangeEnd) {
            const cur = new Date(rangeStart + 'T00:00:00');
            const end = new Date(rangeEnd + 'T00:00:00');
            while (cur <= end) {
                allDates.push(cur.toISOString().split('T')[0]);
                cur.setDate(cur.getDate() + 1);
            }
        } else {
            allDates.push(...Array.from(dailyByDate.keys()).sort());
        }

        const totalLeaveInPeriod = Array.from(dailyByDate.values()).reduce((s, d) => s + d.instructors_on_leave, 0);

        dailySection = `<h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Day-by-Day Summary</h2>
        <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Aggregated totals across all universities for each day. Instructors on leave this ${type === 'weekly' ? 'week' : 'month'}: <strong>${totalLeaveInPeriod}</strong>.</p>
        <div class="table-wrap"><table>
        <thead><tr>
            <th style="text-align:left">Date</th>
            <th>Sessions Done/Planned</th><th>Sess %</th>
            <th>Attended/Enrolled</th><th>Att %</th>
            <th>Coach Calls</th><th>Parent Calls</th><th>At-Risk</th>
            <th>On Leave</th>
            <th>Events</th><th>Exams</th>
        </tr></thead><tbody>` +
        allDates.map((date) => {
            const d = dailyByDate.get(date);
            const dayOfWeek = new Date(date + 'T00:00:00').getDay();
            const isSunday = dayOfWeek === 0;
            if (!d) {
                return `<tr style="background:${isSunday ? '#fef2f2' : '#fefce8'}">
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${formatShortDate(date)}</td>
                    <td colspan="10" style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-style:italic">${isSunday ? 'Sunday — No Operations' : 'No Data Reported (Holiday / Off Day)'}</td>
                </tr>`;
            }
            const dSess = d.sessions_planned > 0 ? Math.round((d.sessions_completed / d.sessions_planned) * 100) : 0;
            const dAtt = d.enrolled > 0 ? Math.round((d.attended / d.enrolled) * 100) : 0;
            return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${formatShortDate(date)}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:500">${d.sessions_completed}/${d.sessions_planned}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:${rateColor(dSess)}">${dSess}%</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:500">${d.attended}/${d.enrolled}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:${rateColor(dAtt)}">${dAtt}%</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.coach_calls}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.parent_calls}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${d.at_risk_total > 0 ? '#dc2626' : '#16a34a'}">${d.at_risk_total}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${d.instructors_on_leave > 0 ? '#ca8a04' : '#16a34a'}">${d.instructors_on_leave}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.events_executed}/${d.events_planned}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${Math.min(d.exams_completed, d.exams_planned)}/${d.exams_planned}</td>
            </tr>`;
        }).join('') +
        `</tbody></table></div>`;
    }

    // ── Cancellation Reasons ──
    let cancellationSection = '';
    const cancellations = byUniv.filter((r: any) => r.cancellation_reason && n(r.sessions_cancelled) > 0);
    if (cancellations.length > 0) {
        cancellationSection = `
        <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Session Cancellation Reasons</h2>
        <div class="table-wrap"><table><thead><tr>
            <th style="text-align:left">University</th><th style="text-align:center">Cancelled</th><th style="text-align:left">Reason</th>
        </tr></thead><tbody>` +
        cancellations.map((r: any) => `<tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:500">${r.university_name}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:600">${n(r.sessions_cancelled)}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.cancellation_reason}</td>
        </tr>`).join('') +
        `</tbody></table></div>`;
    }

    // ── Remarks (universities with notes but no cancellations) ──
    let remarksSection = '';
    const withRemarks = byUniv.filter((r: any) => r.cancellation_reason && n(r.sessions_cancelled) === 0);
    if (withRemarks.length > 0) {
        remarksSection = `
        <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Remarks</h2>
        <div class="table-wrap"><table><thead><tr>
            <th style="text-align:left">University</th><th style="text-align:left">Remarks</th>
        </tr></thead><tbody>` +
        withRemarks.map((r: any) => `<tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:500">${r.university_name}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.cancellation_reason}</td>
        </tr>`).join('') +
        `</tbody></table></div>`;
    }

    // ── Key Observations (auto-generated) ──
    const observations: string[] = [];
    if (sessRate < 80) observations.push(`Session completion is at ${sessRate}% (target: 80%). ${totalSessionsCancelled} sessions were cancelled across ${byUniv.length} universities.`);
    else if (sessRate >= 95) observations.push(`Excellent session completion rate of ${sessRate}% — ${totalSessionsCompleted} of ${totalSessionsPlanned} sessions delivered.`);
    if (attRate < 70) observations.push(`Attendance is critically low at ${attRate}%. ${totalAbsent} students were absent out of ${totalEnrolled} enrolled.`);
    else if (attRate >= 90) observations.push(`Strong attendance rate of ${attRate}% across all campuses.`);
    if (coachRate < 50 && totalAbsent > 0) observations.push(`Coach call coverage is ${coachRate}% — only ${totalCoachCalls} calls made for ${totalAbsent} absent students.`);
    if (totalAtRisk > 0 && atRiskInformedRate < 80) observations.push(`${totalAtRisk} at-risk students identified but only ${totalAtRiskInformed} (${atRiskInformedRate}%) have been informed.`);
    if (totalEventsCancelled > 0) observations.push(`${totalEventsCancelled} event(s) cancelled out of ${totalEventsPlanned} planned.`);
    if (byUniv.length > 1) {
        const univWithAtt = byUniv.filter((r: any) => n(r.enrolled) > 0).map((r: any) => ({ name: r.university_name, rate: Math.round((n(r.attended) / n(r.enrolled)) * 100) }));
        if (univWithAtt.length > 1) {
            const best = univWithAtt.reduce((a: any, b: any) => a.rate > b.rate ? a : b);
            const worst = univWithAtt.reduce((a: any, b: any) => a.rate < b.rate ? a : b);
            if (best.rate !== worst.rate) observations.push(`Highest attendance: ${best.name} (${best.rate}%). Needs attention: ${worst.name} (${worst.rate}%).`);
        }
    }

    let observationsSection = '';
    if (observations.length > 0) {
        observationsSection = `
        <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Key Observations</h2>
        <div style="margin-top:12px;display:grid;gap:8px">` +
        observations.map((obs, i) => `<div style="padding:12px 16px;background:${i % 2 === 0 ? '#fefce8' : '#fff7ed'};border-left:4px solid ${i % 2 === 0 ? '#ca8a04' : '#ea580c'};border-radius:0 8px 8px 0;font-size:13px;color:#1e293b">${obs}</div>`).join('') +
        `</div>`;
    }

    // ── Charts Section ──
    let chartsSection = '';
    if (type !== 'daily' && rawDaily.length > 0) {
        const dailyByDate = new Map<string, any>();
        for (const row of rawDaily) {
            const d = toDateStr(row.date);
            if (!dailyByDate.has(d)) dailyByDate.set(d, { sessions_completed: 0, attended: 0, enrolled: 0 });
            const agg = dailyByDate.get(d)!;
            agg.sessions_completed += n(row.sessions_completed);
            agg.attended += n(row.attended);
            agg.enrolled += n(row.enrolled);
        }
        const sortedDays = Array.from(dailyByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
        const sessionBars = sortedDays.map(([date, d]) => ({
            label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
            value: d.sessions_completed, color: '#7c3aed'
        }));
        const attBars = sortedDays.map(([date, d]) => ({
            label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
            value: d.attended, color: '#3b82f6'
        }));
        const univSessionBars = byUniv.filter((r: any) => n(r.sessions_planned) > 0).slice(0, 12).map((r: any) => ({
            label: (r.university_name || '').length > 16 ? r.university_name.substring(0, 16) + '..' : r.university_name,
            value: n(r.sessions_completed), max: n(r.sessions_planned), color: '#6366f1'
        }));

        chartsSection = `
        <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Visual Summary</h2>
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);text-align:center;margin-bottom:24px;margin-top:16px">
            ${svgDonut(sessRate, 'Sessions', rateColor(sessRate), 100)}
            ${svgDonut(attRate, 'Attendance', rateColor(attRate), 100)}
            ${svgDonut(coachRate, 'Coach Calls', rateColor(coachRate), 100)}
            ${svgDonut(eventExecRate, 'Events', rateColor(eventExecRate), 100)}
        </div>
        <div class="kpi-grid" style="grid-template-columns:1fr 1fr;margin-top:16px">
            <div>
                <p style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px">Sessions Completed per Day</p>
                ${svgBar(sessionBars, 130)}
            </div>
            <div>
                <p style="font-size:12px;font-weight:700;color:#3b82f6;margin-bottom:8px">Students Attended per Day</p>
                ${svgBar(attBars, 130)}
            </div>
        </div>
        ${univSessionBars.length > 0 ? `<div style="margin-top:24px">
            <p style="font-size:12px;font-weight:700;color:#6366f1;margin-bottom:8px">Sessions by University (Completed / Planned)</p>
            ${svgHBar(univSessionBars)}
        </div>` : ''}`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniOps — ${title}</title>
    <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 32px; color: #1e293b; background: #fff; }
    h1 { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 700; color: #1e293b; margin-top: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; word-break: break-word; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin: 24px 0; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
    .kpi .label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }
    .kpi .value { font-size: 36px; font-weight: 800; margin-top: 8px; line-height: 1; }
    .kpi .sub { font-size: 11px; color: #94a3b8; margin-top: 6px; }
    .kpi-highlight { background: linear-gradient(135deg, #f0f4ff, #e0e7ff); border-color: #c7d2fe; }
    .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #2563eb; } .amber { color: #d97706; } .purple { color: #7c3aed; }
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 12px -16px 0; padding: 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; min-width: 700px; }
    thead tr { background: #f1f5f9; }
    th { padding: 10px 8px; text-align: center; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; white-space: nowrap; }
    th:first-child { text-align: left; }
    td { padding: 10px 8px; text-align: center; border-bottom: 1px solid #e5e7eb; }
    td:first-child { text-align: left; }
    .footer { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
    @media (max-width: 768px) {
        body { padding: 16px 12px; }
        h1 { font-size: 20px; }
        h2 { font-size: 16px; }
        .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px; }
        .kpi { padding: 14px 10px; }
        .kpi .value { font-size: 26px; }
        .kpi .label { font-size: 9px; letter-spacing: 1px; }
        table { font-size: 11px; }
        th, td { padding: 6px 4px; }
    }
    @media (max-width: 480px) {
        body { padding: 12px 8px; }
        h1 { font-size: 18px; }
        .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
        .kpi .value { font-size: 22px; }
        .kpi { padding: 12px 8px; }
        table { font-size: 10px; }
    }
    @media print { body { padding: 16px; } .kpi { break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
    </style></head><body>
    <h1>UniOps — ${title}</h1>
    <p class="subtitle">Generated on ${new Date().toLocaleString('en-IN')} | UniConnect Operations Dashboard${univFilter ? ` | ${byUniv[0]?.university_name || univFilter} only` : ` | ${byUniv.length} universit${byUniv.length === 1 ? 'y' : 'ies'}`}</p>

    <h2 style="margin-top:24px">Performance Overview</h2>
    <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Key performance indicators for the ${type === 'daily' ? 'day' : type === 'weekly' ? 'week' : 'month'}. Green = good (80%+), Yellow = needs improvement (50-79%), Red = critical (&lt;50%).</p>
    <div class="kpi-grid">
        <div class="kpi kpi-highlight">
            <div class="label">Session Completion</div>
            <div class="value" style="color:${rateColor(sessRate)}">${sessRate}%</div>
            <div class="sub">${totalSessionsCompleted} of ${totalSessionsPlanned} sessions · ${totalSessionsCancelled} cancelled</div>
        </div>
        <div class="kpi kpi-highlight">
            <div class="label">Attendance Rate</div>
            <div class="value" style="color:${rateColor(attRate)}">${attRate}%</div>
            <div class="sub">${totalAttended} of ${totalEnrolled} students</div>
        </div>
        <div class="kpi">
            <div class="label">Coach Call Coverage</div>
            <div class="value" style="color:${rateColor(coachRate)}">${coachRate}%</div>
            <div class="sub">${totalCoachCalls} calls for ${totalAbsent} absent</div>
        </div>
        <div class="kpi">
            <div class="label">Parent Call Coverage</div>
            <div class="value" style="color:${rateColor(parentRate)}">${parentRate}%</div>
            <div class="sub">${totalParentCalls} parent calls</div>
        </div>
        <div class="kpi">
            <div class="label">At-Risk Students</div>
            <div class="value ${totalAtRisk > 0 ? 'red' : 'green'}">${totalAtRisk}</div>
            <div class="sub">${totalAtRiskInformed} informed (${atRiskInformedRate}%)</div>
        </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi">
            <div class="label">Event Execution</div>
            <div class="value" style="color:${rateColor(eventExecRate)}">${eventExecRate}%</div>
            <div class="sub">${totalEventsExecuted} of ${totalEventsPlanned}${totalEventsCancelled > 0 ? ` · ${totalEventsCancelled} cancelled` : ''}</div>
        </div>
        <div class="kpi">
            <div class="label">Exam Completion</div>
            <div class="value" style="color:${rateColor(examRate)}">${examRate}%</div>
            <div class="sub">${totalExamsCompleted} of ${totalExamsPlanned} exams</div>
        </div>
        <div class="kpi">
            <div class="label">Total Instructors</div>
            <div class="value blue">${n(s.instructors_total)}</div>
            <div class="sub">${n(s.instructors_on_leave)} on leave</div>
        </div>
        <div class="kpi">
            <div class="label">Universities</div>
            <div class="value">${byUniv.length}</div>
            <div class="sub">reporting ${type === 'daily' ? 'today' : 'this period'}</div>
        </div>
    </div>

    ${aiSummary ? `
    <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">AI Executive Summary</h2>
    <div style="margin-top:16px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:0 12px 12px 0;padding:20px 24px">` +
        aiSummary.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^[-*]\s+/gm, '')
            .split('\n').filter((l: string) => l.trim())
            .map((p: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#374151">${p.trim()}</p>`)
            .join('') +
    `</div>` : ''}

    ${chartsSection}

    ${observationsSection}

    <h2 style="margin-top:32px">University-wise Breakdown</h2>
    <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Detailed numbers for each university.</p>
    <div class="table-wrap">
    <table>
        <thead><tr>
            <th style="text-align:left">University</th>
            <th>Planned</th><th>Done</th><th>Canc.</th>
            <th>Enrolled</th><th>Attended</th><th>Absent</th>
            <th>Coach Calls</th><th>Parent Calls</th>
            <th>At-Risk</th><th>Informed</th>
            <th>Instructors</th>
            <th>Events</th><th>Exams</th><th>Post-Exam</th>
        </tr></thead>
        <tbody>${univRows}${totalRow}</tbody>
    </table>
    </div>

    ${cancellationSection}
    ${remarksSection}
    ${teamSection}
    ${dailySection}

    <div class="footer">Auto-generated by UniConnect Ops Dashboard | ${new Date().toLocaleString('en-IN')} | ${type.charAt(0).toUpperCase() + type.slice(1)} Operations Report</div>
    </body></html>`;
}
