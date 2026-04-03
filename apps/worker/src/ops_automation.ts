/**
 * Phase 2: Ops Automation Worker
 *
 * Scheduled jobs:
 * 1. Daily Report (6 PM IST) — aggregate all universities + AI summary + email to admins
 * 2. Form Submission Reminders (5 PM IST) — push notification for missing daily forms
 * 3. Smart Alerts (every sync cycle) — real-time threshold checks
 */

import {
    db,
    getOpsDailyReport,
    aggregateAllUniversities,
    getDailyFormComplianceStatus,
    getUserFcmTokens,
    createNotification,
} from '@uniconnect/shared';
import * as admin from 'firebase-admin';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ─── Helpers ─────────────────────────────────────────────────────────

function getISTNow(): Date {
    const now = new Date();
    const istOffset = 5.5 * 60; // minutes
    return new Date(now.getTime() + (istOffset + (now.getTimezoneOffset() || 0)) * 60000);
}

function getTodayIST(): string {
    return getISTNow().toISOString().split('T')[0];
}

// BullMQ connection for queueing emails
let emailQueue: Queue | null = null;
function getEmailQueue(): Queue {
    if (!emailQueue) {
        const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: null
        });
        emailQueue = new Queue('system-notifications', { connection });
    }
    return emailQueue;
}

// ─── 1. Daily Report at 6 PM IST ────────────────────────────────────

let lastDailyReportDate = '';

export async function processDailyReport() {
    const nowIST = getISTNow();
    const hour = nowIST.getHours();
    const todayStr = getTodayIST();

    // Run at 6 PM IST (18:00), only once per day
    if (hour !== 18) return;
    if (lastDailyReportDate === todayStr) return;

    // Check dedup via notification source_id
    const sourceId = `OPS_DAILY_REPORT_${todayStr}`;
    const check = await db.query('SELECT 1 FROM notifications WHERE source_id = $1 LIMIT 1', [sourceId]);
    if (check.rows.length > 0) {
        lastDailyReportDate = todayStr;
        return;
    }

    console.log(`[OPS-AUTO] Generating daily report for ${todayStr}...`);

    try {
        // 1. Run aggregation for all universities
        const aggregated = await aggregateAllUniversities(todayStr);
        console.log(`[OPS-AUTO] Aggregated data for ${aggregated.length} universities`);

        // 2. Get the full report
        const report = await getOpsDailyReport(todayStr);

        // 3. Get compliance status
        const compliance = await getDailyFormComplianceStatus(todayStr);
        const submitted = compliance.filter((c: any) => c.submitted);
        const missing = compliance.filter((c: any) => !c.submitted);

        // 4. Generate AI summary
        const aiSummary = await generateAISummary(report, compliance);

        // 5. Build HTML email
        const html = buildDailyReportHTML(todayStr, report, compliance, aiSummary);

        // 6. Get admin emails
        const admins = await getAdminUsers();

        // 7. Send email to each admin
        const queue = getEmailQueue();
        for (const adm of admins) {
            await queue.add('send-notification', {
                to: adm.email,
                subject: `UniConnect Daily Ops Report — ${formatDate(todayStr)} | ${submitted.length}/${compliance.length} Universities Reporting`,
                html,
                text: `Daily Ops Report for ${todayStr}. ${submitted.length}/${compliance.length} universities submitted. Check UniConnect for full details.`
            });
        }

        // 8. Create in-app notifications for admins
        for (const adm of admins) {
            await createNotification({
                user_id: adm.id,
                title: 'Daily Ops Report Ready',
                message: `Report for ${formatDate(todayStr)} generated. ${submitted.length}/${compliance.length} universities reported.${missing.length > 0 ? ` Missing: ${missing.map((m: any) => m.university_name).join(', ')}` : ''}`,
                type: 'SYSTEM',
                link: '/ops-dashboard?view=daily-reports',
                source_id: sourceId
            });
        }

        // 9. Push notification to admins
        await sendPushToAdmins(
            admins,
            'Daily Ops Report Ready',
            `${formatDate(todayStr)}: ${submitted.length}/${compliance.length} universities | ${report.summary?.sessions_completed || 0} sessions completed`,
            '/ops-dashboard?view=daily-reports',
            sourceId
        );

        lastDailyReportDate = todayStr;
        console.log(`[OPS-AUTO] Daily report sent to ${admins.length} admins for ${todayStr}`);
    } catch (err: any) {
        console.error('[OPS-AUTO] Daily report generation failed:', err.message);
    }
}

// ─── 2. Form Submission Reminders at 5 PM IST ──────────────────────

let lastReminderDate = '';

export async function processFormReminders() {
    const nowIST = getISTNow();
    const hour = nowIST.getHours();
    const minute = nowIST.getMinutes();
    const todayStr = getTodayIST();

    // Skip weekends (Saturday=6, Sunday=0)
    const dayOfWeek = nowIST.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    // Run at 5 PM IST (17:00), only once per day
    if (hour !== 17) return;
    if (lastReminderDate === todayStr) return;

    const sourceId = `OPS_FORM_REMINDER_${todayStr}`;
    const check = await db.query('SELECT 1 FROM notifications WHERE source_id = $1 LIMIT 1', [sourceId]);
    if (check.rows.length > 0) {
        lastReminderDate = todayStr;
        return;
    }

    console.log(`[OPS-AUTO] Checking daily form compliance for ${todayStr}...`);

    try {
        const compliance = await getDailyFormComplianceStatus(todayStr);
        const missing = compliance.filter((c: any) => !c.submitted);

        if (missing.length === 0) {
            console.log('[OPS-AUTO] All universities have submitted daily forms. No reminders needed.');
            lastReminderDate = todayStr;
            return;
        }

        console.log(`[OPS-AUTO] ${missing.length} universities haven't submitted daily form. Sending reminders...`);

        // Get ops users for each missing university
        for (const univ of missing) {
            const opsUsers = await db.query(`
                SELECT DISTINCT u.id, u.email, u.name
                FROM users u
                LEFT JOIN user_universities uu ON u.id = uu.user_id
                WHERE u.is_active = true
                  AND u.role IN ('PROGRAM_OPS', 'COS', 'PM', 'PMA', 'CMA_MANAGER')
                  AND (u.university_id = $1 OR uu.university_id = $1)
            `, [univ.university_id]);

            for (const user of opsUsers.rows) {
                const userSourceId = `${sourceId}_${user.id}`;

                await createNotification({
                    user_id: user.id,
                    title: "Daily Report Not Submitted",
                    message: `${univ.university_name} hasn't submitted today's daily ops report yet. Please submit before 6 PM to be included in the daily summary.`,
                    type: 'SYSTEM',
                    link: '/ops-dashboard',
                    source_id: userSourceId
                });

                // Push notification
                if (admin.apps.length > 0) {
                    const tokens = await getUserFcmTokens(user.id);
                    if (tokens.length > 0) {
                        try {
                            await admin.messaging().sendEachForMulticast({
                                notification: {
                                    title: 'Daily Report Reminder',
                                    body: `${univ.university_name}: Please submit today's daily ops report before 6 PM.`
                                },
                                data: { action: 'OPEN_OPS_FORM', sourceId: userSourceId },
                                tokens: [...new Set(tokens)],
                                webpush: {
                                    notification: {
                                        tag: userSourceId,
                                        requireInteraction: true,
                                        vibrate: [200, 100, 200]
                                    },
                                    fcmOptions: { link: '/ops-dashboard' }
                                }
                            });
                        } catch (pushErr: any) {
                            console.warn(`[OPS-AUTO] Push failed for ${user.email}:`, pushErr.message);
                        }
                    }
                }
            }
        }

        // Also notify admins about missing submissions
        const admins = await getAdminUsers();
        const missingNames = missing.map((m: any) => m.university_name).join(', ');
        for (const adm of admins) {
            await createNotification({
                user_id: adm.id,
                title: `${missing.length} Universities Missing Daily Report`,
                message: `Missing: ${missingNames}. Reminders have been sent to ops teams.`,
                type: 'SYSTEM',
                link: '/ops-dashboard',
                source_id: `${sourceId}_ADMIN_${adm.id}`
            });
        }

        lastReminderDate = todayStr;
        console.log(`[OPS-AUTO] Sent form reminders for ${missing.length} universities`);
    } catch (err: any) {
        console.error('[OPS-AUTO] Form reminder check failed:', err.message);
    }
}

// ─── 3. Smart Alerts (runs every cycle) ─────────────────────────────

let lastAlertDate = '';
let alertsSentToday = new Set<string>();

export async function processSmartAlerts() {
    const todayStr = getTodayIST();
    const nowIST = getISTNow();

    // Skip weekends
    const dayOfWeek = nowIST.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    // Only check between 9 AM and 7 PM IST
    const hour = nowIST.getHours();
    if (hour < 9 || hour > 19) return;

    // Reset alert tracking at start of new day
    if (lastAlertDate !== todayStr) {
        alertsSentToday = new Set<string>();
        lastAlertDate = todayStr;
    }

    try {
        // Get today's data for all universities
        const dailyData = await db.query(
            'SELECT * FROM ops_daily_data WHERE date = $1',
            [todayStr]
        );

        if (dailyData.rows.length === 0) return;

        const admins = await getAdminUsers();

        for (const row of dailyData.rows) {
            const univName = row.university_name;
            const enrolled = parseInt(row.enrolled) || 0;
            const attended = parseInt(row.attended) || 0;
            const sessionsCancelled = parseInt(row.sessions_cancelled) || 0;
            const atRiskTotal = parseInt(row.at_risk_total) || 0;
            const atRiskInformed = parseInt(row.at_risk_informed) || 0;

            // Alert 1: Attendance below 50%
            if (enrolled > 0) {
                const attendanceRate = Math.round((attended / enrolled) * 100);
                const alertKey = `LOW_ATT_${univName}_${todayStr}`;
                if (attendanceRate < 50 && !alertsSentToday.has(alertKey)) {
                    alertsSentToday.add(alertKey);
                    await sendAlert(
                        admins,
                        `Low Attendance Alert: ${univName}`,
                        `${univName} has only ${attendanceRate}% attendance today (${attended}/${enrolled} students). Immediate attention required.`,
                        `/ops-dashboard?view=attendance`,
                        `SMART_ALERT_${alertKey}`
                    );
                }
            }

            // Alert 2: More than 3 sessions cancelled
            if (sessionsCancelled > 3) {
                const alertKey = `HIGH_CANCEL_${univName}_${todayStr}`;
                if (!alertsSentToday.has(alertKey)) {
                    alertsSentToday.add(alertKey);
                    await sendAlert(
                        admins,
                        `High Cancellation Alert: ${univName}`,
                        `${univName} has ${sessionsCancelled} sessions cancelled today. Reason: ${row.cancellation_reason || 'Not specified'}`,
                        `/ops-dashboard?view=sessions`,
                        `SMART_ALERT_${alertKey}`
                    );
                }
            }

            // Alert 3: At-risk students not being informed
            if (atRiskTotal > 5 && atRiskInformed < atRiskTotal * 0.5) {
                const alertKey = `RISK_GAP_${univName}_${todayStr}`;
                if (!alertsSentToday.has(alertKey)) {
                    alertsSentToday.add(alertKey);
                    await sendAlert(
                        admins,
                        `At-Risk Follow-up Gap: ${univName}`,
                        `${univName} has ${atRiskTotal} at-risk students but only ${atRiskInformed} have been informed (${Math.round((atRiskInformed / atRiskTotal) * 100)}%). Ensure all at-risk students are contacted.`,
                        `/ops-dashboard?view=at-risk`,
                        `SMART_ALERT_${alertKey}`
                    );
                }
            }
        }

        // Alert 4: Missing daily form by 4 PM
        if (hour >= 16) {
            const compliance = await getDailyFormComplianceStatus(todayStr);
            const missing = compliance.filter((c: any) => !c.submitted);
            if (missing.length > 0) {
                const alertKey = `MISSING_FORM_${todayStr}`;
                if (!alertsSentToday.has(alertKey)) {
                    alertsSentToday.add(alertKey);
                    const missingNames = missing.map((m: any) => m.university_name).join(', ');
                    await sendAlert(
                        admins,
                        `${missing.length} Universities: Daily Form Missing`,
                        `As of 4 PM, these universities haven't submitted: ${missingNames}. Report deadline is 6 PM.`,
                        `/ops-dashboard`,
                        `SMART_ALERT_${alertKey}`
                    );
                }
            }
        }
    } catch (err: any) {
        // Don't log every cycle — only on unexpected errors
        if (!err.message?.includes('does not exist')) {
            console.error('[OPS-AUTO] Smart alert check failed:', err.message);
        }
    }
}

// ─── Shared Helpers ─────────────────────────────────────────────────

async function getAdminUsers(): Promise<{ id: string; email: string; name: string }[]> {
    const result = await db.query(`
        SELECT id, email, name FROM users
        WHERE is_active = true AND role IN ('ADMIN', 'PROGRAM_OPS')
        ORDER BY role, name
    `);
    return result.rows;
}

async function sendAlert(
    admins: { id: string; email: string; name: string }[],
    title: string,
    message: string,
    link: string,
    sourceId: string
) {
    // Dedup check
    const check = await db.query('SELECT 1 FROM notifications WHERE source_id = $1 LIMIT 1', [sourceId]);
    if (check.rows.length > 0) return;

    for (const adm of admins) {
        await createNotification({
            user_id: adm.id,
            title,
            message,
            type: 'SYSTEM',
            link,
            source_id: sourceId
        });
    }

    // Push notification
    await sendPushToAdmins(admins, title, message, link, sourceId);

    console.log(`[OPS-AUTO] ALERT: ${title}`);
}

async function sendPushToAdmins(
    admins: { id: string; email: string; name: string }[],
    title: string,
    body: string,
    link: string,
    sourceId: string
) {
    if (admin.apps.length === 0) return;

    const allTokens = new Set<string>();
    for (const adm of admins) {
        const tokens = await getUserFcmTokens(adm.id);
        tokens.forEach((t: string) => allTokens.add(t));
    }

    if (allTokens.size === 0) return;

    try {
        await admin.messaging().sendEachForMulticast({
            notification: { title, body },
            data: { action: 'OPEN_OPS_DASHBOARD', sourceId },
            tokens: [...allTokens],
            webpush: {
                notification: {
                    tag: sourceId,
                    requireInteraction: true,
                    vibrate: [200, 100, 200]
                },
                fcmOptions: { link }
            }
        });
    } catch (err: any) {
        console.warn('[OPS-AUTO] Push notification failed:', err.message);
    }
}

// ─── AI Summary Generator ───────────────────────────────────────────

async function generateAISummary(report: any, compliance: any[]): Promise<string> {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) {
        return 'AI summary unavailable — Gemini API key not configured.';
    }

    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;

    const submitted = compliance.filter((c: any) => c.submitted);
    const missing = compliance.filter((c: any) => !c.submitted);

    const univSummary = byUniv.map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)}, Attendance ${n(r.attended)}/${n(r.enrolled)} (${uAtt}%), At-Risk ${n(r.at_risk_total)}, Coach Calls ${n(r.coach_calls)}`;
    }).join('\n');

    const prompt = `Generate a concise executive summary (4-6 paragraphs) for today's UniConnect daily ops report email.

DATA:
- Date: ${report.date}
- Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
- Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
- Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
- At-Risk: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed
- Events: ${n(s.events_executed)}/${n(s.events_planned)} executed
- Compliance: ${submitted.length}/${compliance.length} universities submitted${missing.length > 0 ? `. Missing: ${missing.map((m: any) => m.university_name).join(', ')}` : ''}

UNIVERSITY BREAKDOWN:
${univSummary || 'No data'}

Write in a professional tone for senior management. Highlight key wins, concerns, and 2-3 action items. Keep it under 300 words. No markdown — plain text paragraphs only.`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 2048, temperature: 0.2 }
                })
            });

            if (response.status === 429) {
                console.warn(`[OPS-AUTO] Gemini ${model} rate limited, trying next...`);
                continue;
            }
            if (!response.ok) continue;

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch {
            continue;
        }
    }

    return 'AI summary could not be generated at this time.';
}

// ─── HTML Report Builder ────────────────────────────────────────────

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildDailyReportHTML(date: string, report: any, compliance: any[], aiSummary: string): string {
    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const n = (v: any) => parseInt(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const submitted = compliance.filter((c: any) => c.submitted);
    const missing = compliance.filter((c: any) => !c.submitted);

    const kpiColor = (value: number, good: number, warn: number) =>
        value >= good ? '#10b981' : value >= warn ? '#f59e0b' : '#ef4444';

    // University rows for table
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

    // Compliance rows
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

<!-- Header -->
<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:12px 12px 0 0;padding:24px 32px;color:white">
    <h1 style="margin:0;font-size:22px;font-weight:700">UniConnect Daily Ops Report</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:0.9">${formatDate(date)}</p>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.7">Auto-generated at 6:00 PM IST</p>
</div>

<!-- KPI Cards -->
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151">Performance Overview</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
            <td style="padding:8px;text-align:center;width:25%">
                <div style="background:#f0f9ff;border-radius:8px;padding:12px">
                    <div style="font-size:24px;font-weight:700;color:${kpiColor(sessRate, 90, 70)}">${sessRate}%</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px">Session Completion</div>
                    <div style="font-size:11px;color:#9ca3af">${n(s.sessions_completed)}/${n(s.sessions_planned)}</div>
                </div>
            </td>
            <td style="padding:8px;text-align:center;width:25%">
                <div style="background:#f0fdf4;border-radius:8px;padding:12px">
                    <div style="font-size:24px;font-weight:700;color:${kpiColor(attRate, 80, 60)}">${attRate}%</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px">Attendance Rate</div>
                    <div style="font-size:11px;color:#9ca3af">${n(s.attended)}/${n(s.enrolled)}</div>
                </div>
            </td>
            <td style="padding:8px;text-align:center;width:25%">
                <div style="background:#fefce8;border-radius:8px;padding:12px">
                    <div style="font-size:24px;font-weight:700;color:#d97706">${n(s.at_risk_total)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px">At-Risk Students</div>
                    <div style="font-size:11px;color:#9ca3af">${n(s.at_risk_informed)} informed</div>
                </div>
            </td>
            <td style="padding:8px;text-align:center;width:25%">
                <div style="background:${missing.length === 0 ? '#f0fdf4' : '#fef2f2'};border-radius:8px;padding:12px">
                    <div style="font-size:24px;font-weight:700;color:${missing.length === 0 ? '#10b981' : '#ef4444'}">${submitted.length}/${compliance.length}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px">Report Compliance</div>
                    <div style="font-size:11px;color:#9ca3af">${missing.length === 0 ? 'All submitted' : `${missing.length} missing`}</div>
                </div>
            </td>
        </tr>
    </table>
</div>

<!-- AI Summary -->
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">AI Executive Summary</h2>
    <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:#374151">
        ${aiSummary.split('\n').filter(l => l.trim()).map(p => `<p style="margin:0 0 8px">${p}</p>`).join('')}
    </div>
</div>

<!-- University Breakdown Table -->
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">University Breakdown</h2>
    <div style="overflow-x:auto">
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
            <thead>
                <tr style="background:#f9fafb">
                    <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">University</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Sessions</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Sess %</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Attendance</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Att %</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">At-Risk</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Coach</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">Events</th>
                </tr>
            </thead>
            <tbody>${univRows || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af">No data available</td></tr>'}</tbody>
        </table>
    </div>
</div>

<!-- Compliance Status -->
<div style="background:white;padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151">Report Compliance Status</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
        <thead>
            <tr style="background:#f9fafb">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280">University</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Status</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Submitted By</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;color:#6b7280">Time</th>
            </tr>
        </thead>
        <tbody>${complianceRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af">No compliance data</td></tr>'}</tbody>
    </table>
</div>

<!-- Footer -->
<div style="background:#1f2937;border-radius:0 0 12px 12px;padding:20px 32px;color:#9ca3af;font-size:12px;text-align:center">
    <p style="margin:0">This report was automatically generated by UniConnect Ops Automation.</p>
    <p style="margin:8px 0 0">View full dashboard: <a href="https://uniconnect-app.up.railway.app/ops-dashboard" style="color:#60a5fa;text-decoration:none">uniconnect-app.up.railway.app/ops-dashboard</a></p>
</div>

</div>
</body>
</html>`;
}

// ─── Main Entry Point ───────────────────────────────────────────────

export async function processOpsAutomation() {
    try {
        await Promise.all([
            processSmartAlerts(),
            processFormReminders(),
            processDailyReport(),
        ]);
    } catch (err: any) {
        console.error('[OPS-AUTO] Error in ops automation cycle:', err.message);
    }
}
