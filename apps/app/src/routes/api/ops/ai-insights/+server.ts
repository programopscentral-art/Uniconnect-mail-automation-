import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

const GEMINI_KEY = () => (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const apiKey = GEMINI_KEY();
    if (!apiKey || apiKey.length < 10) {
        return json({ insights: '' });
    }

    const body = await request.json();
    const { report, type } = body;
    if (!report) throw error(400, 'Report data required');

    const s = report.summary || {};
    const byUniv = report.byUniversity || [];
    const compliance = report.compliance || [];
    const teamActivity = report.teamActivity || [];

    const n = (v: any) => parseInt(v) || 0;
    const f = (v: any) => parseFloat(v) || 0;

    const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
    const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
    const coachRate = n(s.enrolled) - n(s.attended) > 0 ? Math.round((n(s.coach_calls) / (n(s.enrolled) - n(s.attended))) * 100) : 0;

    // Build comprehensive data summary for AI
    const univSummary = byUniv.map((r: any) => {
        const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
        const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
        return `${r.university_name}: Sessions ${n(r.sessions_completed)}/${n(r.sessions_planned)} (${uSess}%), Attendance ${n(r.attended)}/${n(r.enrolled)} (${uAtt}%), Coach Calls ${n(r.coach_calls)}, At-Risk ${n(r.at_risk_total)} (${n(r.at_risk_informed)} informed), Instructors ${n(r.instructors_total)} (${n(r.instructors_on_leave)} on leave), Events ${n(r.events_executed)}/${n(r.events_planned)}, Cancelled Sessions ${n(r.sessions_cancelled)}${r.cancellation_reason ? ` [Reason: ${r.cancellation_reason}]` : ''}`;
    }).join('\n');

    const teamSummary = teamActivity.map((r: any) =>
        `${r.university_name}: Instructors Active ${n(r.instructors_active)} (avg ${f(r.avg_hours_instructors).toFixed(1)}h), Coaches ${n(r.coaches_active)} (avg ${f(r.avg_hours_coaches).toFixed(1)}h), Ops ${n(r.program_ops_active)} (avg ${f(r.avg_hours_program_ops).toFixed(1)}h), Calls ${n(r.total_calls_made)}, Tickets ${n(r.tickets_resolved)}, Clicks/Shares ${n(r.clicks_shares_sent)}`
    ).join('\n');

    const complianceSummary = (() => {
        const total = compliance.length;
        const complete = compliance.filter((r: any) => [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length === 3).length;
        const missing = compliance.filter((r: any) => [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length === 0).length;
        return `${total} reports expected, ${complete} complete, ${total - complete - missing} partial, ${missing} missing (${total > 0 ? Math.round((complete / total) * 100) : 0}% compliance rate)`;
    })();

    const periodLabel = type === 'daily' ? `Daily Report for ${report.date}` :
        type === 'weekly' ? `Weekly Report (${report.weekStart} to ${report.weekEnd})` :
        `Monthly Report (${report.year}-${String(report.month).padStart(2, '0')})`;

    const prompt = `You are a senior operations analyst for UniConnect, an educational technology platform that manages university programs. Analyze this ${type} operations report and provide an executive summary with actionable insights.

REPORT: ${periodLabel}

OVERALL METRICS:
- Sessions: ${n(s.sessions_completed)}/${n(s.sessions_planned)} completed (${sessRate}%), ${n(s.sessions_cancelled)} cancelled
- Attendance: ${n(s.attended)}/${n(s.enrolled)} students (${attRate}%)
- Absent Students: ${n(s.enrolled) - n(s.attended)}
- Coach Call Coverage: ${n(s.coach_calls)} calls for ${n(s.enrolled) - n(s.attended)} absent students (${coachRate}%)
- Parent Calls: ${n(s.parent_calls)}
- At-Risk Students: ${n(s.at_risk_total)} total, ${n(s.at_risk_informed)} informed, ${n(s.acknowledgments)} acknowledged
- Events: ${n(s.events_executed)}/${n(s.events_planned)} executed, ${n(s.events_cancelled)} cancelled
- Exams: ${n(s.exams_completed)}/${n(s.exams_planned)} completed
- Post-Exam Communications: ${n(s.post_exam_comms_sent)} sent
- Instructors: ${n(s.instructors_total)} total, ${n(s.instructors_on_leave)} on leave

UNIVERSITY BREAKDOWN:
${univSummary || 'No university data available'}

TEAM ACTIVITY:
${teamSummary || 'No team activity data available'}

REPORT COMPLIANCE:
${complianceSummary}

Provide a detailed executive summary in plain text (no markdown, no bullet symbols, just clean paragraphs with clear section headers in ALL CAPS) covering:

1. EXECUTIVE SUMMARY — 2-3 sentence overview of the operational health for this period
2. SESSION & ATTENDANCE ANALYSIS — Deep dive into session completion and student attendance. Which universities are performing well vs struggling?
3. STUDENT ENGAGEMENT — Coach call effectiveness, parent outreach, at-risk student management. Are absent students being followed up adequately?
4. TEAM PRODUCTIVITY — How active and productive are instructors, coaches, and program ops? Who is underperforming?
5. EVENT & EXAM OPERATIONS — Event execution rate, exam completion, post-exam communication effectiveness
6. COMPLIANCE STATUS — Report filing status across universities. Who is compliant vs lagging?
7. RED FLAGS — Any critical issues that need immediate attention (low attendance, high at-risk, missing reports, etc.)
8. RECOMMENDATIONS — 4-5 specific, actionable recommendations for management to improve operations this week

Be data-driven, reference specific universities and numbers. Be direct and honest about problems. This report will be read by senior management.`;

    const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-flash-latest',
    ];
    let aiText: string | null = null;
    let lastError = '';

    for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 3000,
                            temperature: 0.3,
                        },
                    }),
                });

                if (response.status === 429) {
                    lastError = `${model}: rate limited (429)`;
                    console.warn(`[OPS_AI] ${lastError}, waiting 5s...`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }

                if (!response.ok) {
                    const errText = await response.text();
                    lastError = `${model}: ${response.status} - ${errText.slice(0, 200)}`;
                    console.warn(`[OPS_AI] ${lastError}`);
                    break;
                }

                const data = await response.json();
                aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
                if (aiText) break;
            } catch (e: any) {
                lastError = `${model}: ${e.message}`;
                console.warn(`[OPS_AI] ${lastError}`);
                break;
            }
        }
        if (aiText) break;
    }

    return json({ insights: aiText || '' });
};
