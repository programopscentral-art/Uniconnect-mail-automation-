import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

const GEMINI_KEY = () => (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const apiKey = GEMINI_KEY();
    if (!apiKey || apiKey.length < 10) {
        throw error(500, 'Gemini API key not configured');
    }

    const body = await request.json();
    const { mode, team, user: userInfo, stats, task_types, priority_breakdown, weekly_trend, communication_tasks, dateRange, universityFilter } = body;

    let prompt = '';

    if (mode === 'user' && userInfo && stats) {
        prompt = `You are an operations analytics expert. Analyze this individual team member's performance data and provide actionable insights.

MEMBER: ${userInfo.name} (${userInfo.role}) — ${userInfo.university_name || 'Global'}
DATE RANGE: ${dateRange === 'all' ? 'All Time' : dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 30 Days' : dateRange === '90d' ? 'Last 90 Days' : 'Custom Range'}

PERFORMANCE STATS:
- Tasks: ${stats.total_assigned} assigned, ${stats.total_completed} completed, ${stats.total_in_progress} in progress, ${stats.total_pending} pending, ${stats.total_overdue} overdue
- Completion Rate: ${stats.total_assigned > 0 ? Math.round((stats.total_completed / stats.total_assigned) * 100) : 0}%
- Avg Completion Time: ${stats.avg_completion_hours > 0 ? stats.avg_completion_hours.toFixed(1) + 'h' : 'N/A'}
- Fastest: ${stats.fastest_completion_hours > 0 ? stats.fastest_completion_hours.toFixed(1) + 'h' : 'N/A'}, Slowest: ${stats.slowest_completion_hours > 0 ? stats.slowest_completion_hours.toFixed(1) + 'h' : 'N/A'}
- On Time: ${stats.on_time}, Late: ${stats.late}

TASK TYPES: ${task_types?.recurring || 0} recurring tasks, ${task_types?.unique || 0} unique tasks
PRIORITY BREAKDOWN: ${(priority_breakdown || []).map((p: any) => `${p.priority}: ${p.completed}/${p.total} (avg ${p.avg_hours?.toFixed(1) || 0}h)`).join(', ')}
WEEKLY TREND (recent weeks): ${(weekly_trend || []).map((w: any) => w.completed).join(' → ')} tasks/week
COMMUNICATION TASKS: ${communication_tasks?.completed || 0}/${communication_tasks?.total || 0} completed

Provide a detailed analysis in plain text (no markdown formatting, no bullet symbols, just clean paragraphs) covering:
1. PERFORMANCE SUMMARY — Overall assessment of this person's work output
2. STRENGTHS — What they're doing well
3. AREAS FOR IMPROVEMENT — Where they can get better
4. TASK RECOMMENDATIONS — What types of tasks they should focus on, which to deprioritize
5. WORKLOAD ASSESSMENT — Are they overloaded or underutilized? Suggest optimal load
6. ACTIONABLE SUGGESTIONS — 3-4 specific, concrete next steps

Keep it concise but insightful. Be direct and specific. Use the actual numbers.`;
    } else if (mode === 'team' && team?.length > 0) {
        const topMembers = team.slice(0, 20); // limit to avoid token overflow
        const memberSummary = topMembers.map((m: any) =>
            `${m.name} (${m.role}, ${m.university_name || 'Global'}): ${m.total_completed}/${m.total_assigned} done, ${m.total_overdue} overdue, avg ${parseFloat(m.avg_completion_hours || 0).toFixed(1)}h, streak ${m.current_streak}d, on-time ${m.tasks_completed_on_time}/${(parseInt(m.tasks_completed_on_time || 0) + parseInt(m.tasks_completed_late || 0))}`
        ).join('\n');

        const totalAssigned = team.reduce((s: number, m: any) => s + (parseInt(m.total_assigned) || 0), 0);
        const totalCompleted = team.reduce((s: number, m: any) => s + (parseInt(m.total_completed) || 0), 0);
        const totalOverdue = team.reduce((s: number, m: any) => s + (parseInt(m.total_overdue) || 0), 0);

        prompt = `You are an operations analytics expert. Analyze this team's performance data and provide strategic insights for management.

TEAM SIZE: ${team.length} members
FILTER: ${universityFilter === 'ALL' ? 'All Universities' : 'Filtered by University'}
DATE RANGE: ${dateRange === 'all' ? 'All Time' : dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 30 Days' : dateRange === '90d' ? 'Last 90 Days' : 'Custom Range'}

TEAM TOTALS:
- ${totalAssigned} tasks assigned, ${totalCompleted} completed (${totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0}% efficiency)
- ${totalOverdue} tasks overdue

INDIVIDUAL BREAKDOWN:
${memberSummary}

Provide a detailed analysis in plain text (no markdown formatting, no bullet symbols, just clean paragraphs) covering:
1. TEAM HEALTH — Overall assessment of team productivity and morale indicators
2. TOP PERFORMERS — Who stands out and why
3. MEMBERS NEEDING SUPPORT — Who might be struggling and what help they need
4. WORK DISTRIBUTION — Is work evenly distributed? Who's overloaded vs underutilized?
5. BOTTLENECK ANALYSIS — Where are tasks getting stuck? Any patterns in overdue tasks?
6. TASK ALLOCATION RECOMMENDATIONS — Suggest how to redistribute work for optimal output
7. STRATEGIC RECOMMENDATIONS — 3-5 specific actions management should take this week

Be data-driven, direct, and specific. Reference actual team members by name. Use the numbers.`;
    } else {
        throw error(400, 'Invalid analytics data');
    }

    // Call Gemini API
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
    let aiText: string | null = null;

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.4,
                    },
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[ANALYTICS_AI] Gemini ${model} failed: ${response.status} ${errText}`);
                continue;
            }

            const data = await response.json();
            aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
            if (aiText) break;
        } catch (e) {
            console.warn(`[ANALYTICS_AI] Gemini ${model} error:`, e);
            continue;
        }
    }

    if (!aiText) {
        throw error(502, 'Failed to get AI response from Gemini');
    }

    return json({ insights: aiText });
};
