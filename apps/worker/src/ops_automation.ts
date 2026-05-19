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
    getOpsWeeklyReport,
    getOpsMonthlyReport,
    aggregateAllUniversities,
    getDailyFormComplianceStatus,
    getUserFcmTokens,
    createNotification,
    getOpsUniversityRankings,
    getOpsTaskPatterns,
    getOpsPeerComparison,
    normalizeOpsUniversityNames,
    buildOpsReportV2,
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

    // Run at 8 PM IST (20:00), only once per day
    if (hour !== 20) return;
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

        // 2. Get the full report + faculty/coach/budget data in parallel
        const [report, compliance] = await Promise.all([
            getOpsDailyReport(todayStr),
            getDailyFormComplianceStatus(todayStr),
        ]);
        const submitted = compliance.filter((c: any) => c.submitted);
        const missing = compliance.filter((c: any) => !c.submitted);

        // 3. Generate AI summary
        const aiSummary = await generateAISummary(report, compliance);

        // 4. Build HTML email using v2 template
        // "Full Report" CTA points to the rich /full-report endpoint, not the email body /view-report
        const dashUrl = 'https://uniconnect-app.up.railway.app/ops-dashboard';
        const reportUrl = `https://uniconnect-app.up.railway.app/api/ops/full-report?type=daily&date=${todayStr}`;
        const html = buildOpsReportV2({
            mode: 'daily',
            periodLabel: formatDate(todayStr),
            report,
            aiSummary,
            dashboardUrl: dashUrl,
            reportUrl,
        });

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

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateRange(startStr: string, endStr: string): string {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    const sDay = s.getDate();
    const eDay = e.getDate();
    const sMonth = s.toLocaleDateString('en-IN', { month: 'long' });
    const eMonth = e.toLocaleDateString('en-IN', { month: 'long' });
    const eYear = e.getFullYear();
    const ordinal = (n: number) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    if (sMonth === eMonth) {
        return `${ordinal(sDay)} — ${ordinal(eDay)} ${eMonth} ${eYear}`;
    }
    return `${ordinal(sDay)} ${sMonth} — ${ordinal(eDay)} ${eMonth} ${eYear}`;
}

// ─── 4. Weekly Analytics Report (Sunday 8 PM IST) ───────────────────

let lastWeeklyAnalyticsDate = '';

export async function processWeeklyAnalyticsReport() {
    const nowIST = getISTNow();
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday
    const hour = nowIST.getHours();

    // Run on Sundays at 12 PM IST (12:00)
    if (dayOfWeek !== 0 || hour !== 12) return;

    const todayStr = getTodayIST();
    if (lastWeeklyAnalyticsDate === todayStr) return;

    // Week range: previous Monday to Saturday (full completed week)
    const weekEndDate = new Date(nowIST);
    weekEndDate.setDate(weekEndDate.getDate() - 1); // Saturday
    const weekEnd = weekEndDate.toISOString().split('T')[0];
    const weekStartDate = new Date(weekEndDate);
    weekStartDate.setDate(weekStartDate.getDate() - 5); // Monday
    const weekStart = weekStartDate.toISOString().split('T')[0];

    const sourceId = `OPS_WEEKLY_REPORT_${weekEnd}`;
    const check = await db.query('SELECT 1 FROM notifications WHERE source_id = $1 LIMIT 1', [sourceId]);
    if (check.rows.length > 0) {
        lastWeeklyAnalyticsDate = todayStr;
        return;
    }

    console.log(`[OPS-AUTO] Generating weekly report for ${weekStart} to ${weekEnd}...`);

    try {
        // 1. Gather ALL data — ops data + analytics + faculty/coach/budget
        const [weeklyReport, rankings, taskPatterns, peerComparison] = await Promise.all([
            getOpsWeeklyReport(weekStart, weekEnd),
            getOpsUniversityRankings(weekStart, weekEnd),
            getOpsTaskPatterns(weekStart, weekEnd),
            getOpsPeerComparison(weekStart, weekEnd),
        ]);

        // 2. Generate AI summary with full data
        const aiSummary = await generateWeeklyAI(weeklyReport, rankings, taskPatterns, peerComparison);

        // 3. Build comprehensive HTML email using v2 template
        // "Full Report" CTA points to /full-report (rich page with budgets/faculty/coaches/etc.)
        const dashUrl = 'https://uniconnect-app.up.railway.app/ops-dashboard';
        const reportUrl = `https://uniconnect-app.up.railway.app/api/ops/full-report?type=weekly&weekStart=${weekStart}&weekEnd=${weekEnd}`;
        const html = buildOpsReportV2({
            mode: 'weekly',
            periodLabel: formatDateRange(weekStart, weekEnd),
            report: weeklyReport,
            aiSummary,
            dashboardUrl: dashUrl,
            reportUrl,
        });

        // 4. Send to admins
        const admins = await getAdminUsers();
        const queue = getEmailQueue();
        const n = (v: any) => parseInt(v) || 0;
        const summary = weeklyReport.summary || {};

        for (const adm of admins) {
            await queue.add('send-notification', {
                to: adm.email,
                subject: `UniConnect Weekly Report — ${formatDateRange(weekStart, weekEnd)} | ${n(summary.sessions_completed)} Sessions, ${rankings.length} Universities`,
                html,
                text: `Weekly Report for ${formatDateRange(weekStart, weekEnd)}. ${n(summary.sessions_completed)} sessions completed, ${n(summary.attended)} students attended. ${rankings.length} universities ranked. Check UniConnect for full details.`
            });
        }

        // 5. In-app notifications
        for (const adm of admins) {
            await createNotification({
                user_id: adm.id,
                title: 'Weekly Ops Report Ready',
                message: `${formatDateRange(weekStart, weekEnd)}: ${n(summary.sessions_completed)} sessions, ${n(summary.attended)} attended, ${rankings.length} universities. Top: ${rankings[0]?.university_name || 'N/A'}.`,
                type: 'SYSTEM',
                link: '/analytics',
                source_id: sourceId
            });
        }

        // 6. Push notification
        await sendPushToAdmins(
            admins,
            'Weekly Ops Report Ready',
            `${formatDateRange(weekStart, weekEnd)}: ${n(summary.sessions_completed)} sessions, ${rankings.length} universities`,
            '/analytics',
            sourceId
        );

        lastWeeklyAnalyticsDate = todayStr;
        console.log(`[OPS-AUTO] Weekly report sent to ${admins.length} admins`);
    } catch (err: any) {
        console.error('[OPS-AUTO] Weekly report failed:', err.message);
    }
}

async function generateWeeklyAI(weeklyReport: any, rankings: any[], taskPatterns: any, peerComparison: any): Promise<string> {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) {
        return 'AI summary unavailable — Gemini API key not configured.';
    }

    const n = (v: any) => parseInt(v) || 0;
    const s = weeklyReport.summary || {};
    const byUniv = weeklyReport.byUniversity || [];
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;

    const univBreakdown = byUniv.map((r: any) => {
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)} (${uSess}%), Attendance ${n(r.attended)}/${n(r.enrolled)} (${uAtt}%), Coach Calls ${n(r.coach_calls)}, Leave ${n(r.instructors_on_leave)}`;
    }).join('\n');

    const rankingsList = rankings.map((r: any, i: number) =>
        `#${i + 1} ${r.university_name}: Score ${r.score}/100`
    ).join('\n');

    const topPerformers = (peerComparison?.users || []).slice(0, 8).map((u: any) =>
        `${u.user_name} (${u.university_name}): ${u.completed}/${u.total_tasks} tasks, ${u.on_time_count} on-time`
    ).join('\n');

    const prompt = `Generate a comprehensive weekly operations summary (6-8 paragraphs) for UniConnect senior management.

WEEK: ${weeklyReport.weekStart} to ${weeklyReport.weekEnd}

AGGREGATE TOTALS:
- Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} completed (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
- Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
- Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
- At-Risk Students: ${n(s.at_risk_total)} identified, ${n(s.at_risk_informed)} informed
- Events: ${n(s.events_executed)}/${n(s.events_planned)} executed, ${n(s.events_cancelled)} cancelled
- Exams: ${n(s.exams_completed)}/${n(s.exams_planned)} completed

UNIVERSITY BREAKDOWN:
${univBreakdown || 'No data'}

RANKINGS:
${rankingsList || 'No rankings'}

TOP PERFORMERS:
${topPerformers || 'No data'}

Cover: 1) Executive overview of the week's operational health with key numbers, 2) Session delivery analysis — which universities excelled/struggled, 3) Attendance trends and student engagement insights, 4) At-risk student management effectiveness, 5) Event execution summary, 6) Top/bottom performing universities and why, 7) Team performance highlights, 8) 3-5 specific action items for management for the coming week.

Be data-driven with specific names and numbers. Professional tone for senior management. Under 500 words. No markdown — plain text paragraphs only.`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 4096, temperature: 0.2 }
                })
            });
            if (response.status === 429) continue;
            if (!response.ok) continue;
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch { continue; }
    }
    return 'AI summary could not be generated at this time.';
}


// ─── 5. Monthly Report (Last day of month, 9 PM IST) ────────────────

let lastMonthlyReportMonth = '';

export async function processMonthlyReport() {
    const nowIST = getISTNow();
    const hour = nowIST.getHours();

    // Run at 8 PM IST (20:00) on last day of month
    if (hour !== 20) return;

    // Check if today is the last day of the month
    const tomorrow = new Date(nowIST);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === nowIST.getMonth()) return; // not last day

    const year = nowIST.getFullYear();
    const month = nowIST.getMonth() + 1; // 1-indexed
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    if (lastMonthlyReportMonth === monthKey) return;

    const sourceId = `OPS_MONTHLY_REPORT_${monthKey}`;
    const check = await db.query('SELECT 1 FROM notifications WHERE source_id = $1 LIMIT 1', [sourceId]);
    if (check.rows.length > 0) {
        lastMonthlyReportMonth = monthKey;
        return;
    }

    console.log(`[OPS-AUTO] Generating monthly report for ${monthKey}...`);

    try {
        // 1. Fetch full month data
        const monthlyReport = await getOpsMonthlyReport(year, month);

        // 2. Fetch rankings + faculty/coach/budget for the month in parallel
        const rankings = await getOpsUniversityRankings(monthlyReport.startDate, monthlyReport.endDate);

        // 3. Generate AI summary
        const aiSummary = await generateMonthlyAI(monthlyReport, rankings);

        // 4. Build HTML using v2 template
        // "Full Report" CTA points to /full-report (rich page with budgets/faculty/coaches/etc.)
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const dashUrl = 'https://uniconnect-app.up.railway.app/ops-dashboard';
        const reportUrl = `https://uniconnect-app.up.railway.app/api/ops/full-report?type=monthly&year=${year}&month=${month}`;
        const html = buildOpsReportV2({
            mode: 'monthly',
            periodLabel: monthName,
            report: monthlyReport,
            aiSummary,
            dashboardUrl: dashUrl,
            reportUrl,
        });

        // 5. Send to admins
        const admins = await getAdminUsers();
        const queue = getEmailQueue();
        const n = (v: any) => parseInt(v) || 0;
        const summary = monthlyReport.summary || {};

        for (const adm of admins) {
            await queue.add('send-notification', {
                to: adm.email,
                subject: `UniConnect Monthly Report — ${monthName} | ${n(summary.sessions_completed)} Sessions, ${n(summary.attended)} Students`,
                html,
                text: `Monthly Report for ${monthName}. ${n(summary.sessions_completed)} sessions, ${n(summary.attended)} students attended, ${rankings.length} universities. Check UniConnect for details.`
            });
        }

        // 6. In-app notifications
        for (const adm of admins) {
            await createNotification({
                user_id: adm.id,
                title: `Monthly Ops Report — ${monthName}`,
                message: `${monthName}: ${n(summary.sessions_completed)} sessions, ${n(summary.attended)} students, ${rankings.length} universities ranked. Top: ${rankings[0]?.university_name || 'N/A'}.`,
                type: 'SYSTEM',
                link: '/analytics',
                source_id: sourceId
            });
        }

        // 7. Push notification
        await sendPushToAdmins(
            admins,
            `Monthly Report — ${monthName}`,
            `${n(summary.sessions_completed)} sessions, ${n(summary.attended)} students, ${rankings.length} universities`,
            '/analytics',
            sourceId
        );

        lastMonthlyReportMonth = monthKey;
        console.log(`[OPS-AUTO] Monthly report sent to ${admins.length} admins for ${monthName}`);
    } catch (err: any) {
        console.error('[OPS-AUTO] Monthly report failed:', err.message);
    }
}

async function generateMonthlyAI(monthlyReport: any, rankings: any[]): Promise<string> {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 10) {
        return 'AI summary unavailable — Gemini API key not configured.';
    }

    const n = (v: any) => parseInt(v) || 0;
    const s = monthlyReport.summary || {};
    const byUniv = monthlyReport.byUniversity || [];
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;

    const univBreakdown = byUniv.map((r: any) => {
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)} (${uSess}%), Attendance ${n(r.attended)}/${n(r.enrolled)} (${uAtt}%), Coach Calls ${n(r.coach_calls)}`;
    }).join('\n');

    const rankingsList = rankings.map((r: any, i: number) =>
        `#${i + 1} ${r.university_name}: Score ${r.score}/100`
    ).join('\n');

    const monthName = new Date(monthlyReport.year, monthlyReport.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const prompt = `Generate a comprehensive monthly operations summary (8-10 paragraphs) for UniConnect senior management.

MONTH: ${monthName} (${monthlyReport.startDate} to ${monthlyReport.endDate})

AGGREGATE TOTALS:
- Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} completed (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
- Attendance: ${n(s.attended)}/${n(s.enrolled)} (${attRate}%)
- Coach Calls: ${n(s.coach_calls)}, Parent Calls: ${n(s.parent_calls)}
- At-Risk Students: ${n(s.at_risk_total)} identified, ${n(s.at_risk_informed)} informed
- Events: ${n(s.events_executed)}/${n(s.events_planned)} executed, ${n(s.events_cancelled)} cancelled
- Exams: ${n(s.exams_completed)}/${n(s.exams_planned)} completed
- Post-Exam Communications: ${n(s.post_exam_comms_sent)} sent

UNIVERSITY BREAKDOWN:
${univBreakdown || 'No data'}

RANKINGS:
${rankingsList || 'No rankings'}

Cover: 1) Executive overview of the month's performance with headline numbers, 2) Session delivery trends and analysis, 3) Student attendance and engagement analysis, 4) At-risk student management and intervention effectiveness, 5) Events and exam performance, 6) University-wise performance comparison — best and worst performers, 7) Coach and parent outreach effectiveness, 8) Key wins and achievements, 9) Areas of concern requiring attention, 10) 5+ strategic recommendations for next month.

This is a monthly summary for C-level management. Be thorough, data-driven, and reference specific universities and numbers. Professional executive tone. Under 600 words. No markdown — plain text paragraphs only.`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 4096, temperature: 0.2 }
                })
            });
            if (response.status === 429) continue;
            if (!response.ok) continue;
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch { continue; }
    }
    return 'AI summary could not be generated at this time.';
}

// buildMonthlyReportHTML removed — replaced by buildOpsReportV2

// ─── Main Entry Point ───────────────────────────────────────────────

let hasNormalizedNames = false;

export async function processOpsAutomation() {
    try {
        // One-time cleanup: normalize existing university names in ops_daily_data
        if (!hasNormalizedNames) {
            try {
                await normalizeOpsUniversityNames();
                hasNormalizedNames = true;
            } catch (e: any) {
                console.warn('[OPS-AUTO] Name normalization failed (will retry):', e.message);
            }
        }

        await Promise.all([
            processSmartAlerts(),
            processFormReminders(),
            processDailyReport(),
            processWeeklyAnalyticsReport(),
            processMonthlyReport(),
        ]);
    } catch (err: any) {
        console.error('[OPS-AUTO] Error in ops automation cycle:', err.message);
    }
}
