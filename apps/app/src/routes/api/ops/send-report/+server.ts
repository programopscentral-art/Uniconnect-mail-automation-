/**
 * On-demand trigger: send daily ops report email to admins.
 * POST /api/ops/send-report
 * Body: { date?: string }  (defaults to today IST)
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getOpsDailyReport,
    aggregateAllUniversities,
    getDailyFormComplianceStatus,
    db,
} from '@uniconnect/shared';
import { env } from '$env/dynamic/private';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

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

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role)) {
        throw error(403, 'Only admins can trigger report emails');
    }

    const body = await request.json().catch(() => ({}));
    const date = body.date || getISTToday();

    try {
        // 1. Aggregate
        const aggregated = await aggregateAllUniversities(date);

        // 2. Get report + compliance
        const report = await getOpsDailyReport(date);
        const compliance = await getDailyFormComplianceStatus(date);
        const submitted = compliance.filter((c: any) => c.submitted);
        const missing = compliance.filter((c: any) => !c.submitted);

        // 3. AI Summary
        const aiSummary = await generateAISummaryForEmail(report, compliance, date);

        // 4. Build HTML
        const html = buildReportHTML(date, report, compliance, aiSummary);

        // 5. Get admins
        const admins = await db.query(`
            SELECT id, email, name FROM users
            WHERE is_active = true AND role IN ('ADMIN', 'PROGRAM_OPS')
            ORDER BY role, name
        `);

        // 6. Queue emails
        const connection = new IORedis(env.REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: null
        });
        const queue = new Queue('system-notifications', { connection });

        for (const adm of admins.rows) {
            await queue.add('send-notification', {
                to: adm.email,
                subject: `UniConnect Daily Ops Report — ${formatDate(date)} | ${submitted.length}/${compliance.length} Universities`,
                html,
                text: `Daily Ops Report for ${date}. ${submitted.length}/${compliance.length} universities submitted.`
            });
        }

        await connection.quit();

        return json({
            success: true,
            message: `Report email queued for ${admins.rows.length} admin(s)`,
            recipients: admins.rows.map((a: any) => a.email),
            date,
            universities: aggregated.length,
            compliance: { submitted: submitted.length, missing: missing.length, total: compliance.length }
        });
    } catch (err: any) {
        console.error('[OPS-REPORT] Manual trigger failed:', err.message);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};

// ─── AI Summary ─────────────────────────────────────────────────────

async function generateAISummaryForEmail(report: any, compliance: any[], date: string): Promise<string> {
    const apiKey = (env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) return 'AI summary unavailable — API key not configured.';

    const s = report.summary || {};
    const n = (v: any) => parseInt(v) || 0;
    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const submitted = compliance.filter((c: any) => c.submitted);
    const missing = compliance.filter((c: any) => !c.submitted);

    const byUniv = (report.byUniversity || []).map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)}, Attendance ${uAtt}%, At-Risk ${n(r.at_risk_total)}`;
    }).join('\n');

    const prompt = `Generate a concise executive summary (4-6 paragraphs, under 300 words) for UniConnect daily ops report email.

Date: ${date}
Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
At-Risk: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed
Events: ${n(s.events_executed)}/${n(s.events_planned)}
Compliance: ${submitted.length}/${compliance.length}${missing.length > 0 ? `. Missing: ${missing.map((m: any) => m.university_name).join(', ')}` : ''}

Universities:
${byUniv || 'No data'}

Professional tone. Highlight wins, concerns, 2-3 action items. Plain text paragraphs only.`;

    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
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
    return 'AI summary could not be generated.';
}

// ─── HTML Builder (same as worker version) ──────────────────────────

function buildReportHTML(date: string, report: any, compliance: any[], aiSummary: string): string {
    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;
    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const submitted = compliance.filter((c: any) => c.submitted);
    const missing = compliance.filter((c: any) => !c.submitted);

    const kpiColor = (value: number, good: number, warn: number) =>
        value >= good ? '#10b981' : value >= warn ? '#f59e0b' : '#ef4444';

    const univRows = byUniv.map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${r.university_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.sessions_completed)}/${n(r.sessions_planned)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${kpiColor(uSess, 90, 70)}">${uSess}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.attended)}/${n(r.enrolled)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${kpiColor(uAtt, 80, 60)}">${uAtt}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.at_risk_total)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.coach_calls)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.events_executed)}/${n(r.events_planned)}</td>
        </tr>`;
    }).join('');

    const complianceRows = compliance.map((c: any) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${c.university_name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${c.submitted ? '#d1fae5' : '#fee2e2'};color:${c.submitted ? '#065f46' : '#991b1b'}">${c.submitted ? 'Submitted' : 'Missing'}</span>
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#6b7280">${c.submitted_by_name || '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#6b7280">${c.submitted_at ? new Date(c.submitted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
    </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:720px;margin:0 auto;padding:20px">
<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:12px 12px 0 0;padding:24px 32px;color:white">
    <h1 style="margin:0;font-size:22px;font-weight:700">UniConnect Daily Ops Report</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:0.9">${formatDate(date)}</p>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.7">Manually triggered by admin</p>
</div>
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151">Performance Overview</h2>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="padding:8px;text-align:center;width:25%"><div style="background:#f0f9ff;border-radius:8px;padding:12px"><div style="font-size:24px;font-weight:700;color:${kpiColor(sessRate, 90, 70)}">${sessRate}%</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Session Rate</div><div style="font-size:11px;color:#9ca3af">${n(s.sessions_completed)}/${n(s.sessions_planned)}</div></div></td>
        <td style="padding:8px;text-align:center;width:25%"><div style="background:#f0fdf4;border-radius:8px;padding:12px"><div style="font-size:24px;font-weight:700;color:${kpiColor(attRate, 80, 60)}">${attRate}%</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Attendance</div><div style="font-size:11px;color:#9ca3af">${n(s.attended)}/${n(s.enrolled)}</div></div></td>
        <td style="padding:8px;text-align:center;width:25%"><div style="background:#fefce8;border-radius:8px;padding:12px"><div style="font-size:24px;font-weight:700;color:#d97706">${n(s.at_risk_total)}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">At-Risk</div><div style="font-size:11px;color:#9ca3af">${n(s.at_risk_informed)} informed</div></div></td>
        <td style="padding:8px;text-align:center;width:25%"><div style="background:${missing.length === 0 ? '#f0fdf4' : '#fef2f2'};border-radius:8px;padding:12px"><div style="font-size:24px;font-weight:700;color:${missing.length === 0 ? '#10b981' : '#ef4444'}">${submitted.length}/${compliance.length}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Compliance</div><div style="font-size:11px;color:#9ca3af">${missing.length === 0 ? 'All done' : `${missing.length} missing`}</div></div></td>
    </tr></table>
</div>
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">AI Executive Summary</h2>
    <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:#374151">
        ${aiSummary.split('\n').filter(l => l.trim()).map(p => `<p style="margin:0 0 8px">${p}</p>`).join('')}
    </div>
</div>
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">University Breakdown</h2>
    <div style="overflow-x:auto"><table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
        <thead><tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">University</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Sessions</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Sess %</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Attendance</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Att %</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">At-Risk</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Coach</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Events</th>
        </tr></thead>
        <tbody>${univRows || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af">No data</td></tr>'}</tbody>
    </table></div>
</div>
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">Compliance Status</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
        <thead><tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280">University</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Status</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Submitted By</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Time</th>
        </tr></thead>
        <tbody>${complianceRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af">No data</td></tr>'}</tbody>
    </table>
</div>
<div style="background:#1f2937;border-radius:0 0 12px 12px;padding:20px 32px;color:#9ca3af;font-size:12px;text-align:center">
    <p style="margin:0">Generated by UniConnect Ops Automation</p>
    <p style="margin:8px 0 0"><a href="https://uniconnect-app.up.railway.app/ops-dashboard" style="color:#60a5fa;text-decoration:none">View Dashboard</a></p>
</div>
</div></body></html>`;
}
