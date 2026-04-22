/**
 * On-demand trigger: send ops report email to admins.
 * POST /api/ops/send-report
 * Body: { type?: 'daily'|'weekly'|'monthly', date?: string, weekStart?: string, weekEnd?: string, year?: number, month?: number }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getOpsDailyReport,
    getOpsWeeklyReport,
    getOpsMonthlyReport,
    aggregateAllUniversities,
    getDailyFormComplianceStatus,
    canonicalUnivName,
    db,
} from '@uniconnect/shared';
import { env } from '$env/dynamic/private';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { buildOpsReportV2 } from '$lib/email-templates/ops-report-v2';

function getISTToday(): string {
    const now = new Date();
    const istOffset = 5.5 * 60;
    const ist = new Date(now.getTime() + (istOffset + (now.getTimezoneOffset() || 0)) * 60000);
    return ist.toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateRange(start: string, end: string): string {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const BASE_URL = 'https://uniconnect-app.up.railway.app';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role)) {
        throw error(403, 'Only admins can trigger report emails');
    }

    const body = await request.json().catch(() => ({}));
    const type = body.type || 'daily';

    try {
        let html: string;
        let subject: string;
        let textPlain: string;
        let report: any;
        let periodLabel: string;
        let reportUrl: string;

        // template=classic to force legacy emails; otherwise v2 is the default.
        const useV2 = (body.template || 'v2') !== 'classic';
        let prevSummary: any = null;

        if (type === 'weekly') {
            const weekStart = body.weekStart;
            const weekEnd = body.weekEnd;
            if (!weekStart || !weekEnd) throw new Error('weekStart and weekEnd are required for weekly reports');

            report = await getOpsWeeklyReport(weekStart, weekEnd);
            const aiSummary = await generateAISummary(report, type, { weekStart, weekEnd });
            periodLabel = formatDateRange(weekStart, weekEnd);
            // "View full report" opens the wide standalone HTML page.
            reportUrl = `${BASE_URL}/api/ops/full-report?type=weekly&weekStart=${weekStart}&weekEnd=${weekEnd}`;

            if (useV2) {
                try {
                    const ps = new Date(weekStart); ps.setDate(ps.getDate() - 7);
                    const pe = new Date(weekEnd); pe.setDate(pe.getDate() - 7);
                    const prev = await getOpsWeeklyReport(ps.toISOString().split('T')[0], pe.toISOString().split('T')[0]);
                    prevSummary = prev?.summary || null;
                } catch {}
                html = buildOpsReportV2({
                    mode: 'weekly', periodLabel, report, aiSummary,
                    dashboardUrl: `${BASE_URL}/ops-dashboard/v2`, reportUrl, prevSummary
                });
            } else {
                html = buildWeeklyEmailHTML(weekStart, weekEnd, report, aiSummary);
            }

            const n = (v: any) => parseInt(v) || 0;
            const s = report.summary || {};
            subject = `UniConnect Weekly Report — ${periodLabel} | ${n(s.sessions_completed)} Sessions`;
            textPlain = `Weekly Report for ${periodLabel}. ${n(s.sessions_completed)} sessions, ${n(s.attended)} students attended.`;

        } else if (type === 'monthly') {
            const year = body.year;
            const month = body.month;
            if (!year || !month) throw new Error('year and month are required for monthly reports');

            report = await getOpsMonthlyReport(year, month);
            const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            const aiSummary = await generateAISummary(report, type, { year, month, monthName });
            periodLabel = monthName;
            reportUrl = `${BASE_URL}/api/ops/full-report?type=monthly&year=${year}&month=${month}`;

            if (useV2) {
                try {
                    let pYear = year, pMonth = month - 1;
                    if (pMonth === 0) { pMonth = 12; pYear = year - 1; }
                    const prev = await getOpsMonthlyReport(pYear, pMonth);
                    prevSummary = prev?.summary || null;
                } catch {}
                html = buildOpsReportV2({
                    mode: 'monthly', periodLabel, report, aiSummary,
                    dashboardUrl: `${BASE_URL}/ops-dashboard/v2`, reportUrl, prevSummary
                });
            } else {
                html = buildMonthlyEmailHTML(report, aiSummary, monthName, year, month);
            }

            const n = (v: any) => parseInt(v) || 0;
            const s = report.summary || {};
            subject = `UniConnect Monthly Report — ${monthName} | ${n(s.sessions_completed)} Sessions, ${n(s.attended)} Students`;
            textPlain = `Monthly Report for ${monthName}. ${n(s.sessions_completed)} sessions, ${n(s.attended)} students attended.`;

        } else {
            // Daily
            const date = body.date || getISTToday();
            await aggregateAllUniversities(date);
            report = await getOpsDailyReport(date);
            const compliance = await getDailyFormComplianceStatus(date);
            const submitted = compliance.filter((c: any) => c.submitted);
            const aiSummary = await generateAISummary(report, 'daily', { date, compliance });
            periodLabel = formatDate(date);
            reportUrl = `${BASE_URL}/api/ops/full-report?type=daily&date=${date}`;

            if (useV2) {
                try {
                    const prev = new Date(date); prev.setDate(prev.getDate() - 1);
                    const prevReport = await getOpsDailyReport(prev.toISOString().split('T')[0]);
                    prevSummary = prevReport?.summary || null;
                } catch {}
                html = buildOpsReportV2({
                    mode: 'daily', periodLabel, report, aiSummary,
                    dashboardUrl: `${BASE_URL}/ops-dashboard/v2`, reportUrl, prevSummary
                });
            } else {
                html = buildDailyEmailHTML(date, report, aiSummary);
            }

            subject = `UniConnect Daily Ops Report — ${formatDate(date)} | ${submitted.length}/${compliance.length} Universities`;
            textPlain = `Daily Ops Report for ${date}. ${submitted.length}/${compliance.length} universities submitted.`;
        }

        // Get admins
        const admins = await db.query(`
            SELECT id, email, name FROM users
            WHERE is_active = true AND role IN ('ADMIN', 'PROGRAM_OPS')
            ORDER BY role, name
        `);

        // Queue emails
        const connection = new IORedis(env.REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: null
        });
        const queue = new Queue('system-notifications', { connection });

        for (const adm of admins.rows) {
            await queue.add('send-notification', {
                to: adm.email,
                subject,
                html,
                text: textPlain
            });
        }

        // ── Per-university emails to COs, PMs, and university operators ──
        try {
            const univUsers = await db.query(`
                SELECT u.email, u.name as user_name,
                       COALESCE(univ.short_name, univ.name) as university_name
                FROM users u
                JOIN universities univ ON univ.id = u.university_id
                WHERE u.is_active = true
                AND u.university_id IS NOT NULL
                AND u.role IN ('COS', 'PM')
                ORDER BY university_name, u.name
            `);

            // Group recipients by canonical university name
            const univRecipients: Record<string, { email: string; name: string }[]> = {};
            for (const row of univUsers.rows) {
                const key = canonicalUnivName(row.university_name);
                if (!univRecipients[key]) univRecipients[key] = [];
                univRecipients[key].push({ email: row.email, name: row.user_name });
            }

            // Build lookup of report data by university name
            const reportByUniv: Record<string, any> = {};
            for (const r of (report.byUniversity || [])) {
                reportByUniv[r.university_name] = r;
            }

            let univEmailsQueued = 0;
            for (const [univName, recipients] of Object.entries(univRecipients)) {
                const univData = reportByUniv[univName];
                if (!univData || !recipients.length) continue;

                const univReportUrl = `${reportUrl}&university=${encodeURIComponent(univName)}`;
                const univHtml = buildUniversityEmailHTML(type, periodLabel, univName, univData, univReportUrl);
                const univSubject = `UniConnect ${type.charAt(0).toUpperCase() + type.slice(1)} Report — ${univName}`;
                const univText = `${type} report for ${univName}. Sessions: ${univData.sessions_completed || 0}/${univData.sessions_planned || 0}. Attendance: ${univData.attended || 0}/${univData.enrolled || 0}.`;

                for (const recipient of recipients) {
                    await queue.add('send-notification', {
                        to: recipient.email,
                        subject: univSubject,
                        html: univHtml,
                        text: univText
                    });
                    univEmailsQueued++;
                }
            }
            console.log(`[OPS-REPORT] Per-university emails queued: ${univEmailsQueued}`);
        } catch (univErr: any) {
            console.warn('[OPS-REPORT] Per-university emails failed (non-fatal):', univErr.message);
        }

        await connection.quit();

        return json({
            success: true,
            message: `${type.charAt(0).toUpperCase() + type.slice(1)} report email queued for ${admins.rows.length} admin(s) + per-university emails`,
            recipients: admins.rows.map((a: any) => a.email),
            type,
        });
    } catch (err: any) {
        console.error(`[OPS-REPORT] Manual ${type} trigger failed:`, err.message);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};

// ─── AI Summary (generic for all report types) ──────────────────────

async function generateAISummary(report: any, type: string, opts: any): Promise<string> {
    const apiKey = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) return 'AI summary unavailable — Gemini API key not configured.';

    const s = report.summary || {};
    const n = (v: any) => parseInt(v) || 0;
    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;

    const byUniv = (report.byUniversity || []).map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)}, Attendance ${uAtt}%, At-Risk ${n(r.at_risk_total)}`;
    }).join('\n');

    let periodInfo = '';
    if (type === 'daily') {
        const compliance = opts.compliance || [];
        const submitted = compliance.filter((c: any) => c.submitted);
        const missing = compliance.filter((c: any) => !c.submitted);
        periodInfo = `Date: ${opts.date}\nCompliance: ${submitted.length}/${compliance.length}${missing.length > 0 ? `. Missing: ${missing.map((m: any) => m.university_name).join(', ')}` : ''}`;
    } else if (type === 'weekly') {
        periodInfo = `Week: ${opts.weekStart} to ${opts.weekEnd}`;
    } else {
        periodInfo = `Month: ${opts.monthName} (${opts.year}-${String(opts.month).padStart(2, '0')})`;
    }

    const prompt = `Generate a concise executive summary (4-6 paragraphs, under 300 words) for UniConnect ${type} ops report email.

${periodInfo}
Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
At-Risk: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed
Events: ${n(s.events_executed)}/${n(s.events_planned)}

Universities:
${byUniv || 'No data'}

Professional tone. Highlight wins, concerns, 2-3 action items. Plain text paragraphs only.`;

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
    return 'AI summary could not be generated.';
}

// ─── Shared email helpers ────────────────────────────────────────────

function cleanAIText(text: string): string {
    return text
        .replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^[-*]\s+/gm, '')
        .split('\n').filter(l => l.trim())
        .map(p => `<p style="margin:0 0 10px;font-size:14px;line-height:1.65;color:#374151">${p.trim()}</p>`)
        .join('');
}

function kpiColor(value: number, good: number, warn: number): string {
    return value >= good ? '#10b981' : value >= warn ? '#f59e0b' : '#ef4444';
}

function emailShell(headerBg: string, title: string, subtitle: string, content: string, reportUrl: string, dashUrl: string, accentColor: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

<!-- Header -->
<tr><td style="background:${headerBg};padding:32px 28px 24px">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff">${title}</h1>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.8)">${subtitle}</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5)">Manually triggered by admin</p>
</td></tr>

${content}

<!-- CTA -->
<tr><td style="background:#fff;padding:4px 24px 28px" align="center">
    <table cellpadding="0" cellspacing="0"><tr><td style="background:${headerBg};border-radius:10px">
        <a href="${reportUrl}" style="display:inline-block;padding:14px 48px;font-size:14px;font-weight:600;color:#fff;text-decoration:none">Open Full Report</a>
    </td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td style="background:#1e293b;padding:20px 24px;text-align:center;border-radius:0 0 16px 16px">
    <p style="margin:0;font-size:12px;color:#94a3b8">UniConnect Ops Automation</p>
    <p style="margin:8px 0 0;font-size:12px"><a href="${reportUrl}" style="color:${accentColor};text-decoration:none">Full Report</a> &nbsp;&middot;&nbsp; <a href="${dashUrl}" style="color:${accentColor};text-decoration:none">Dashboard</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ─── Per-University Email HTML ───────────────────────────────────────

function buildUniversityEmailHTML(type: string, periodLabel: string, univName: string, r: any, reportUrl: string): string {
    const n = (v: any) => parseInt(v) || 0;
    const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
    const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
    const dashUrl = `${BASE_URL}/ops-dashboard`;

    const remarkNote = r.cancellation_reason ? `
<tr><td style="background:#fff;padding:0 24px 20px">
    <div style="background:#fffbeb;border-radius:10px;padding:14px 18px;border-left:4px solid #f59e0b">
        <div style="font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Notes / Remarks</div>
        <div style="font-size:13px;color:#78350f">${r.cancellation_reason}</div>
    </div>
</td></tr>` : '';

    const content = `
<tr><td style="background:#fff;padding:24px 24px 12px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="padding:0 6px 12px 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(uSess,90,70)}">${uSess}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Sessions</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(r.sessions_completed)} of ${n(r.sessions_planned)}</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 12px 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(uAtt,80,60)}">${uAtt}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Attendance</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(r.attended)} of ${n(r.enrolled)}</div>
        </td></tr></table></td>
    </tr><tr>
        <td width="50%" style="padding:0 6px 0 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#fffbeb;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#d97706">${n(r.at_risk_total)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">At-Risk</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(r.at_risk_informed)} informed</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 0 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#334155">${n(r.coach_calls)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Coach Calls</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(r.parent_calls)} parent calls</div>
        </td></tr></table></td>
    </tr></table>
</td></tr>
<tr><td style="background:#fff;padding:4px 24px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px"><tr>
        <td style="padding:12px 8px;text-align:center;width:25%"><div style="font-size:18px;font-weight:700;color:#334155">${n(r.sessions_cancelled)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Cancelled</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#334155">${n(r.events_executed)}/${n(r.events_planned)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Events</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#334155">${n(r.instructors_total)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Instructors</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#ef4444">${n(r.instructors_on_leave)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">On Leave</div></td>
    </tr></table>
</td></tr>
${remarkNote}`;

    return emailShell(
        'linear-gradient(135deg,#1e3a8a,#2563eb)',
        `${univName} — ${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
        periodLabel,
        content,
        reportUrl,
        dashUrl,
        '#60a5fa'
    );
}

// ─── Daily Email HTML ────────────────────────────────────────────────

function buildDailyEmailHTML(date: string, report: any, aiSummary: string): string {
    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;

    const cleanAI = cleanAIText(aiSummary);
    const dashUrl = `${BASE_URL}/ops-dashboard`;
    const reportUrl = `${BASE_URL}/api/ops/view-report?type=daily&date=${date}`;

    const univRows = byUniv.map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `<tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;color:#1e293b">${r.university_name}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uSess, 90, 70)}">${uSess}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.sessions_completed)}/${n(r.sessions_planned)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uAtt, 80, 60)}">${uAtt}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.attended)}/${n(r.enrolled)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569">${n(r.coach_calls)}</td>
        </tr>`;
    }).join('');

    const content = `
<!-- KPI 2x2 Grid -->
<tr><td style="background:#fff;padding:24px 24px 12px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="padding:0 6px 12px 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(sessRate, 90, 70)}">${sessRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Sessions</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.sessions_completed)} of ${n(s.sessions_planned)}</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 12px 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(attRate, 80, 60)}">${attRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Attendance</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.attended)} of ${n(s.enrolled)}</div>
        </td></tr></table></td>
    </tr><tr>
        <td width="50%" style="padding:0 6px 0 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#fffbeb;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#d97706">${n(s.at_risk_total)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">At-Risk</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.at_risk_informed)} informed</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 0 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#334155">${n(s.coach_calls)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Coach Calls</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.parent_calls)} parent calls</div>
        </td></tr></table></td>
    </tr></table>
</td></tr>

<!-- Quick Stats -->
<tr><td style="background:#fff;padding:4px 24px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px"><tr>
        <td style="padding:12px 8px;text-align:center;width:25%"><div style="font-size:18px;font-weight:700;color:#334155">${n(s.coach_calls)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Coach Calls</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#334155">${n(s.parent_calls)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Parent Calls</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#334155">${n(s.events_executed)}/${n(s.events_planned)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Events</div></td>
        <td style="padding:12px 8px;text-align:center;width:25%;border-left:1px solid #e2e8f0"><div style="font-size:18px;font-weight:700;color:#334155">${n(s.sessions_cancelled)}</div><div style="font-size:10px;color:#64748b;margin-top:2px">Cancelled</div></td>
    </tr></table>
</td></tr>

<!-- AI Summary -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">AI Executive Summary</h2>
        <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;border-left:4px solid #3b82f6">${cleanAI}</div>
    </div>
</td></tr>

<!-- University Table -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">University Performance</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">University</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Sessions</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Attend.</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Calls</th>
            </tr></thead>
            <tbody>${univRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">No data available</td></tr>'}</tbody>
        </table>
    </div>
</td></tr>
`;

    return emailShell(
        'linear-gradient(135deg,#1e3a8a,#2563eb)',
        'Daily Ops Report',
        formatDate(date),
        content,
        reportUrl,
        dashUrl,
        '#60a5fa'
    );
}

// ─── Weekly Email HTML ───────────────────────────────────────────────

function buildWeeklyEmailHTML(weekStart: string, weekEnd: string, report: any, aiSummary: string): string {
    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;

    const cleanAI = cleanAIText(aiSummary);
    const dashUrl = `${BASE_URL}/ops-dashboard`;
    const reportUrl = `${BASE_URL}/api/ops/view-report?type=weekly&weekStart=${weekStart}&weekEnd=${weekEnd}`;

    const univRows = byUniv.slice(0, 10).map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `<tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;color:#1e293b">${r.university_name}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uSess, 90, 70)}">${uSess}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.sessions_completed)}/${n(r.sessions_planned)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uAtt, 80, 60)}">${uAtt}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.attended)}/${n(r.enrolled)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569">${n(r.coach_calls)}</td>
        </tr>`;
    }).join('');

    const content = `
<!-- KPI 2x2 Grid -->
<tr><td style="background:#fff;padding:24px 24px 12px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="padding:0 6px 12px 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(sessRate, 90, 70)}">${sessRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Sessions</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.sessions_completed)} of ${n(s.sessions_planned)}</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 12px 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(attRate, 80, 60)}">${attRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Attendance</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.attended)} of ${n(s.enrolled)}</div>
        </td></tr></table></td>
    </tr><tr>
        <td width="50%" style="padding:0 6px 0 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#fffbeb;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#d97706">${n(s.at_risk_total)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">At-Risk</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.at_risk_informed)} informed</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 0 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#2563eb">${n(s.coach_calls) + n(s.parent_calls)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Total Calls</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.coach_calls)} coach + ${n(s.parent_calls)} parent</div>
        </td></tr></table></td>
    </tr></table>
</td></tr>

<!-- AI Summary -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">AI Executive Summary</h2>
        <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;border-left:4px solid #7c3aed">${cleanAI}</div>
    </div>
</td></tr>

<!-- University Table -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">University Performance</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">University</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Sessions</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Attend.</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Calls</th>
            </tr></thead>
            <tbody>${univRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">No data available</td></tr>'}</tbody>
        </table>
    </div>
</td></tr>`;

    return emailShell(
        'linear-gradient(135deg,#5b21b6,#7c3aed)',
        'Weekly Ops Report',
        formatDateRange(weekStart, weekEnd),
        content,
        reportUrl,
        dashUrl,
        '#a78bfa'
    );
}

// ─── Monthly Email HTML ──────────────────────────────────────────────

function buildMonthlyEmailHTML(report: any, aiSummary: string, monthName: string, year: number, month: number): string {
    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;

    const cleanAI = cleanAIText(aiSummary);
    const dashUrl = `${BASE_URL}/ops-dashboard`;
    const reportUrl = `${BASE_URL}/api/ops/view-report?type=monthly&year=${year}&month=${month}`;

    const univRows = byUniv.slice(0, 10).map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `<tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;color:#1e293b">${r.university_name}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uSess, 90, 70)}">${uSess}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.sessions_completed)}/${n(r.sessions_planned)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px"><span style="font-weight:700;color:${kpiColor(uAtt, 80, 60)}">${uAtt}%</span><br><span style="color:#94a3b8;font-size:11px">${n(r.attended)}/${n(r.enrolled)}</span></td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569">${n(r.coach_calls)}</td>
        </tr>`;
    }).join('');

    const content = `
<!-- KPI 2x2 Grid -->
<tr><td style="background:#fff;padding:24px 24px 12px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="padding:0 6px 12px 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#ecfdf5;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(sessRate, 90, 70)}">${sessRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Sessions</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.sessions_completed)} of ${n(s.sessions_planned)}</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 12px 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:${kpiColor(attRate, 80, 60)}">${attRate}%</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Attendance</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.attended)} of ${n(s.enrolled)}</div>
        </td></tr></table></td>
    </tr><tr>
        <td width="50%" style="padding:0 6px 0 0"><table width="100%" cellspacing="0" cellpadding="0" style="background:#fffbeb;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#d97706">${n(s.at_risk_total)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">At-Risk</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.at_risk_informed)} informed</div>
        </td></tr></table></td>
        <td width="50%" style="padding:0 0 0 6px"><table width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border-radius:12px"><tr><td style="padding:18px 12px;text-align:center">
            <div style="font-size:30px;font-weight:800;color:#059669">${n(s.events_executed)}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">Events</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${n(s.events_executed)} of ${n(s.events_planned)} executed</div>
        </td></tr></table></td>
    </tr></table>
</td></tr>

<!-- AI Summary -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">AI Executive Summary</h2>
        <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;border-left:4px solid #059669">${cleanAI}</div>
    </div>
</td></tr>

<!-- University Table -->
<tr><td style="background:#fff;padding:0 24px 24px">
    <div style="border-top:1px solid #e2e8f0;padding-top:24px">
        <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1e293b">University Performance</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">University</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Sessions</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Attend.</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Calls</th>
            </tr></thead>
            <tbody>${univRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">No data available</td></tr>'}</tbody>
        </table>
    </div>
</td></tr>`;

    return emailShell(
        'linear-gradient(135deg,#065f46,#059669)',
        'Monthly Ops Report',
        monthName,
        content,
        reportUrl,
        dashUrl,
        '#6ee7b7'
    );
}
