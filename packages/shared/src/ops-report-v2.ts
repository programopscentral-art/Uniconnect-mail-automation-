/**
 * Ops Report v2 Email Template
 * Mirrors the visual language of /ops-dashboard/v2 using email-safe HTML (table-based).
 * One builder function handles daily, weekly, and monthly modes.
 */

export type OpsReportMode = 'daily' | 'weekly' | 'monthly';

export interface OpsReportV2Options {
    mode: OpsReportMode;
    periodLabel: string;
    report: any;
    aiSummary?: string;
    dashboardUrl: string;
    reportUrl: string;
    prevSummary?: any;
    feeData?: any;
}

function feeMoney(n: any): string {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(2) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(2) + ' L';
    if (num >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
}

function renderFeeSection(fee: any, accent1: string, dashboardUrl: string): string {
    if (!fee || !fee.summary) return '';
    const s = fee.summary;
    const totalStudents = (s.fully_paid || 0) + (s.partial_paid || 0) + (s.not_paid || 0);
    const fullyPaidPct = totalStudents > 0 ? Math.round((s.fully_paid / totalStudents) * 100) : 0;
    const eff = Number(s.avg_efficiency || 0);
    const effColor = eff >= 85 ? '#059669' : eff >= 60 ? '#d97706' : '#e11d48';

    const bottomList = (fee.bottomUniversities || []).slice(0, 3).map((u: any) => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#0f172a">${u.university_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#e11d48;font-weight:700">${u.efficiency}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#475569">${feeMoney(u.pending)} pending</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#94a3b8">${u.not_paid} unpaid</td>
        </tr>
    `).join('');

    const loans = (fee.tagCounts || []).find((t: any) => t.tag === 'loan')?.count || 0;
    const dropouts = (fee.tagCounts || []).find((t: any) => t.tag === 'dropout')?.count || 0;

    return `
    <tr><td style="padding:28px 28px 10px">
        <div style="font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.2px">💰 Fee Collection · ${fee.period_name || 'Active period'}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">Cross-cohort fee status snapshot</div>
    </td></tr>
    <tr><td style="padding:0 28px 16px">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,0.04)">
            <tr><td style="padding:22px">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td width="25%" valign="top" style="padding-right:8px">
                            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Total Paid</div>
                            <div style="font-size:22px;font-weight:800;color:#059669;line-height:1;margin-top:5px">${feeMoney(s.total_paid)}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px">of ${feeMoney(s.total_payable)}</div>
                        </td>
                        <td width="25%" valign="top" style="padding-right:8px;padding-left:8px;border-left:1px solid #f1f5f9">
                            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Pending</div>
                            <div style="font-size:22px;font-weight:800;color:#e11d48;line-height:1;margin-top:5px">${feeMoney(s.total_pending)}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px">${s.not_paid || 0} students unpaid</div>
                        </td>
                        <td width="25%" valign="top" style="padding-right:8px;padding-left:8px;border-left:1px solid #f1f5f9">
                            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Avg Efficiency</div>
                            <div style="font-size:22px;font-weight:800;color:${effColor};line-height:1;margin-top:5px">${eff.toFixed(1)}%</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px">${fullyPaidPct}% fully paid</div>
                        </td>
                        <td width="25%" valign="top" style="padding-left:8px;border-left:1px solid #f1f5f9">
                            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Cases</div>
                            <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1;margin-top:5px">${loans + dropouts}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px">${loans} loans · ${dropouts} dropouts</div>
                        </td>
                    </tr>
                </table>
                ${bottomList ? `
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid #f1f5f9">
                    <div style="font-size:11px;font-weight:700;color:#9f1239;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px">⚠️ Universities Needing Attention (lowest efficiency)</div>
                    <table width="100%" cellspacing="0" cellpadding="0">${bottomList}</table>
                </div>` : ''}
                <div style="margin-top:18px;text-align:center">
                    <a href="${dashboardUrl.replace('/ops-dashboard', '/api/fees/analytics')}" style="display:inline-block;background:#A52D2D;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:10px 20px;border-radius:6px;letter-spacing:0.5px">📊 VIEW FULL FEE ANALYTICS</a>
                    <a href="${dashboardUrl.replace('/ops-dashboard', '/fee-collection')}" style="display:inline-block;font-size:11px;color:${accent1};text-decoration:none;font-weight:700;margin-left:12px">Open Dashboard →</a>
                </div>
            </td></tr>
        </table>
    </td></tr>`;
}

const n = (v: any) => {
    if (v === null || v === undefined) return 0;
    const num = Number(v);
    return Number.isFinite(num) ? Math.round(num) : 0;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function tone(value: number, good: number, warn: number) {
    if (value >= good) return '#059669'; // emerald-600
    if (value >= warn) return '#d97706'; // amber-600
    return '#e11d48'; // rose-600
}

function cleanAI(txt: string): string {
    if (!txt) return 'AI insights not available for this period.';
    return txt
        .replace(/\*\*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\n/g, '<br>')
        .trim();
}

function deltaChip(delta: number | null, invert = false): string {
    if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) {
        return `<span style="display:inline-block;font-size:11px;font-weight:600;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:999px;margin-left:6px">0%</span>`;
    }
    const good = invert ? delta < 0 : delta > 0;
    const bg = good ? '#d1fae5' : '#ffe4e6';
    const fg = good ? '#059669' : '#e11d48';
    const arrow = delta > 0 ? '↑' : '↓';
    const v = Math.abs(delta) < 10 ? delta.toFixed(1) : String(Math.round(delta));
    return `<span style="display:inline-block;font-size:11px;font-weight:700;color:${fg};background:${bg};padding:2px 8px;border-radius:999px;margin-left:6px">${arrow} ${delta > 0 ? '+' : '-'}${v.replace('-', '')}%</span>`;
}

function kpiCard(bigNum: string | number, label: string, hint: string, color: string, bgColor = '#ffffff'): string {
    return `
    <td width="25%" style="padding:0 6px 0 0" valign="top">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:${bgColor};border:1px solid #e2e8f0;border-radius:14px">
            <tr><td style="padding:18px 14px">
                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">${label}</div>
                <div style="font-size:30px;font-weight:800;color:${color};line-height:1;margin-top:6px;font-variant-numeric:tabular-nums">${bigNum}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:4px">${hint}</div>
            </td></tr>
        </table>
    </td>`;
}

function barRow(label: string, value: number, max: number, color: string, hint = ''): string {
    const p = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return `
    <tr><td style="padding:0 0 10px 0">
        <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
                <td style="font-size:12px;color:#475569;font-weight:500">${label}</td>
                <td style="font-size:12px;color:#0f172a;font-weight:700;text-align:right;font-variant-numeric:tabular-nums">${value}${hint ? ` <span style="color:#94a3b8;font-weight:400">${hint}</span>` : ''}</td>
            </tr>
        </table>
        <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px"><tr>
            <td style="background:#f1f5f9;height:8px;border-radius:999px">
                <table width="${p}%" cellspacing="0" cellpadding="0"><tr><td style="background:${color};height:8px;border-radius:999px;font-size:0">&nbsp;</td></tr></table>
            </td>
        </tr></table>
    </td></tr>`;
}

function sectionHeader(title: string, subtitle = ''): string {
    return `
    <tr><td style="padding:28px 28px 10px">
        <div style="font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.2px">${title}</div>
        ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${subtitle}</div>` : ''}
    </td></tr>`;
}

function card(inner: string): string {
    return `
    <tr><td style="padding:0 28px 16px">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,0.04)">
            <tr><td style="padding:22px">${inner}</td></tr>
        </table>
    </td></tr>`;
}

function riskCard(atRisk: number, informed: number, enrolled: number): string {
    const riskPct = enrolled > 0 ? Math.round((atRisk / enrolled) * 100) : 0;
    const progress = atRisk > 0 ? Math.round((informed / atRisk) * 100) : 0;
    return `
    <tr><td style="padding:0 28px 16px">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#fff1f2 0%,#ffffff 100%);border:1px solid #fecdd3;border-radius:16px">
            <tr><td style="padding:22px">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td valign="top" width="60">
                            <div style="width:44px;height:44px;background:#fee2e2;border-radius:12px;text-align:center;line-height:44px;font-size:22px;color:#e11d48;font-weight:700">!</div>
                        </td>
                        <td valign="top">
                            <div style="font-size:13px;font-weight:700;color:#9f1239;text-transform:uppercase;letter-spacing:1px">Attendance risk</div>
                            <div style="font-size:36px;font-weight:800;color:#e11d48;line-height:1;margin-top:6px;font-variant-numeric:tabular-nums">${atRisk}</div>
                            <div style="font-size:12px;color:#9f1239;margin-top:4px">Students below 75% attendance · ${riskPct}% of cohort</div>
                        </td>
                        <td valign="top" align="right">
                            <div style="background:#fee2e2;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;color:#be123c;display:inline-block">
                                ${informed} of ${atRisk} informed
                            </div>
                        </td>
                    </tr>
                </table>
                ${atRisk > 0 ? `
                <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px">
                    <tr><td>
                        <div style="font-size:11px;font-weight:600;color:#9f1239;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Follow-through progress</div>
                        <table width="100%" cellspacing="0" cellpadding="0"><tr>
                            <td style="background:#fecdd3;height:10px;border-radius:999px">
                                <table width="${progress}%" cellspacing="0" cellpadding="0"><tr><td style="background:linear-gradient(90deg,#f43f5e,#e11d48);height:10px;border-radius:999px;font-size:0">&nbsp;</td></tr></table>
                            </td>
                        </tr></table>
                    </td></tr>
                </table>` : ''}
            </td></tr>
        </table>
    </td></tr>`;
}

function universityTable(rows: any[], limit = 10): string {
    if (!rows || rows.length === 0) {
        return `<tr><td style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">No university data available.</td></tr>`;
    }
    const head = `
    <tr style="background:#f8fafc">
        <th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">University</th>
        <th style="padding:12px 10px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Sessions</th>
        <th style="padding:12px 10px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Attendance</th>
        <th style="padding:12px 10px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">At-risk</th>
        <th style="padding:12px 10px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Calls</th>
    </tr>`;
    const body = rows.slice(0, limit).map((r) => {
        const uAtt = pct(n(r.attended), n(r.enrolled));
        const uSess = pct(n(r.sessions_completed), n(r.sessions_planned));
        return `
        <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;color:#0f172a">${r.university_name || '—'}</td>
            <td style="padding:12px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px">
                <span style="font-weight:700;color:${tone(uSess, 90, 70)};font-variant-numeric:tabular-nums">${uSess}%</span>
                <span style="color:#94a3b8;font-size:11px;margin-left:4px">${n(r.sessions_completed)}/${n(r.sessions_planned)}</span>
            </td>
            <td style="padding:12px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px">
                <span style="font-weight:700;color:${tone(uAtt, 85, 75)};font-variant-numeric:tabular-nums">${uAtt}%</span>
                <span style="color:#94a3b8;font-size:11px;margin-left:4px">${n(r.attended)}/${n(r.enrolled)}</span>
            </td>
            <td style="padding:12px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:${n(r.at_risk_total) > 0 ? '#e11d48' : '#64748b'};font-weight:600;font-variant-numeric:tabular-nums">${n(r.at_risk_total)}</td>
            <td style="padding:12px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;font-variant-numeric:tabular-nums">${n(r.coach_calls) + n(r.parent_calls)}</td>
        </tr>`;
    }).join('');
    return `<thead>${head}</thead><tbody>${body}</tbody>`;
}

export function buildOpsReportV2(opts: OpsReportV2Options): string {
    const { mode, periodLabel, report, aiSummary, dashboardUrl, reportUrl, prevSummary, feeData } = opts;
    const s = report?.summary || {};
    const byUniv = report?.byUniversity || [];

    const attRate = pct(n(s.attended), n(s.enrolled));
    const sessRate = pct(n(s.sessions_completed), n(s.sessions_planned));
    const callsTotal = n(s.coach_calls) + n(s.parent_calls);
    const engTarget = Math.max(n(s.enrolled) * 0.3, 10);
    const engRate = Math.min(100, pct(callsTotal, engTarget));

    // Detect "no activity" — all key signals are zero. Shown as an empty state
    // so the viewer doesn't misread a 0% attendance as a real result.
    const hasNoData =
        n(s.enrolled) === 0 &&
        n(s.sessions_planned) === 0 &&
        n(s.sessions_completed) === 0 &&
        n(s.coach_calls) === 0 &&
        n(s.parent_calls) === 0 &&
        n(s.at_risk_total) === 0 &&
        n(s.events_planned) === 0 &&
        n(s.exams_planned) === 0 &&
        byUniv.length === 0;

    // deltas
    let attDelta: number | null = null;
    let sessDelta: number | null = null;
    if (prevSummary) {
        const pAtt = pct(n(prevSummary.attended), n(prevSummary.enrolled));
        const pSess = pct(n(prevSummary.sessions_completed), n(prevSummary.sessions_planned));
        attDelta = attRate - pAtt;
        sessDelta = sessRate - pSess;
    }

    const modeLabel = mode === 'daily' ? 'Daily' : mode === 'weekly' ? 'Weekly' : 'Monthly';
    const accent1 = mode === 'daily' ? '#0ea5e9' : mode === 'weekly' ? '#8b5cf6' : '#10b981';
    const accent2 = mode === 'daily' ? '#6366f1' : mode === 'weekly' ? '#ec4899' : '#0ea5e9';

    const heroKPIs = `
    <tr><td style="padding:0 22px">
        <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
                ${kpiCard(`${attRate}%`, 'Attendance', `${n(s.attended)} of ${n(s.enrolled)}`, tone(attRate, 85, 75))}
                ${kpiCard(`${sessRate}%`, 'Completion', `${n(s.sessions_completed)} of ${n(s.sessions_planned)}`, tone(sessRate, 90, 70))}
                ${kpiCard(`${engRate}%`, 'Engagement', `${callsTotal} calls made`, '#8b5cf6')}
                ${kpiCard(n(s.at_risk_total), 'At-risk', `${n(s.at_risk_informed)} informed`, n(s.at_risk_total) > 0 ? '#e11d48' : '#059669')}
            </tr>
        </table>
    </td></tr>`;

    const sessionsContent = `
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">Sessions breakdown</div>
    <table width="100%" cellspacing="0" cellpadding="0">
        ${barRow('Completed', n(s.sessions_completed), n(s.sessions_planned) || 1, '#10b981', `/ ${n(s.sessions_planned)}`)}
        ${barRow('Cancelled', n(s.sessions_cancelled), n(s.sessions_planned) || 1, '#f43f5e', '')}
        ${barRow('Remaining', Math.max(0, n(s.sessions_planned) - n(s.sessions_completed) - n(s.sessions_cancelled)), n(s.sessions_planned) || 1, '#a1a1aa', '')}
    </table>
    ${s.cancellation_reason ? `
    <div style="margin-top:14px;padding:12px 14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.7px">Cancellation reason</div>
        <div style="font-size:13px;color:#78350f;margin-top:4px">${s.cancellation_reason}</div>
    </div>` : ''}`;

    const engagementContent = `
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">Success coach engagement</div>
    <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="50%" style="padding-right:8px">
                <div style="background:#eff6ff;border-radius:12px;padding:16px;text-align:center">
                    <div style="font-size:28px;font-weight:800;color:#0ea5e9;font-variant-numeric:tabular-nums">${n(s.coach_calls)}</div>
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-top:4px">Student calls</div>
                </div>
            </td>
            <td width="50%" style="padding-left:8px">
                <div style="background:#f5f3ff;border-radius:12px;padding:16px;text-align:center">
                    <div style="font-size:28px;font-weight:800;color:#8b5cf6;font-variant-numeric:tabular-nums">${n(s.parent_calls)}</div>
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-top:4px">Parent calls</div>
                </div>
            </td>
        </tr>
    </table>`;

    const instructorsContent = `
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">Instructors</div>
    <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="33%" style="text-align:center;padding:8px">
                <div style="font-size:24px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums">${n(s.instructors_total)}</div>
                <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-top:2px">Total</div>
            </td>
            <td width="33%" style="text-align:center;padding:8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
                <div style="font-size:24px;font-weight:800;color:${n(s.instructors_on_leave) > 0 ? '#d97706' : '#64748b'};font-variant-numeric:tabular-nums">${n(s.instructors_on_leave)}</div>
                <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-top:2px">On leave</div>
            </td>
            <td width="33%" style="text-align:center;padding:8px">
                <div style="font-size:24px;font-weight:800;color:#059669;font-variant-numeric:tabular-nums">${Math.max(0, n(s.instructors_total) - n(s.instructors_on_leave))}</div>
                <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-top:2px">Active</div>
            </td>
        </tr>
    </table>`;

    const eventsContent = `
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">Events & exams</div>
    <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="50%" style="padding-right:8px" valign="top">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px">Events</div>
                <table width="100%" cellspacing="0" cellpadding="0">
                    ${barRow('Planned', n(s.events_planned), Math.max(n(s.events_planned), 1), '#94a3b8', '')}
                    ${barRow('Completed', n(s.events_executed), Math.max(n(s.events_planned), 1), '#10b981', '')}
                    ${barRow('Cancelled', n(s.events_cancelled), Math.max(n(s.events_planned), 1), '#f43f5e', '')}
                </table>
            </td>
            <td width="50%" style="padding-left:8px" valign="top">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px">Exams</div>
                <table width="100%" cellspacing="0" cellpadding="0">
                    ${barRow('Planned', n(s.exams_planned), Math.max(n(s.exams_planned), 1), '#94a3b8', '')}
                    ${barRow('Completed', n(s.exams_completed), Math.max(n(s.exams_planned), 1), '#10b981', '')}
                    ${barRow('Post-exam comms', n(s.post_exam_comms_sent), Math.max(n(s.exams_completed), 1), '#8b5cf6', '')}
                </table>
            </td>
        </tr>
    </table>`;

    const actionsContent = `
    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px">Actions taken</div>
    <table width="100%" cellspacing="0" cellpadding="0">
        ${barRow('Students informed', n(s.at_risk_informed), Math.max(n(s.at_risk_total), 1), '#0ea5e9', n(s.at_risk_total) > 0 ? `/ ${n(s.at_risk_total)}` : '')}
        ${barRow('Parents contacted', n(s.parent_calls), Math.max(n(s.parent_calls), 1), '#8b5cf6', '')}
        ${barRow('Acknowledgments', n(s.acknowledgments), Math.max(n(s.at_risk_informed), 1), '#10b981', n(s.at_risk_informed) > 0 ? `/ ${n(s.at_risk_informed)}` : '')}
    </table>`;

    const aiSection = `
    <tr><td style="padding:0 28px 24px">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,${accent1}15 0%,${accent2}15 100%);border:1px solid ${accent1}30;border-radius:16px">
            <tr><td style="padding:22px 24px">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td valign="middle" width="38">
                            <div style="width:30px;height:30px;background:linear-gradient(135deg,${accent1},${accent2});border-radius:9px;text-align:center;line-height:30px;font-size:16px;color:#fff;font-weight:800">✦</div>
                        </td>
                        <td valign="middle">
                            <div style="font-size:13px;font-weight:700;color:#0f172a">Ops Copilot</div>
                            <div style="font-size:11px;color:#64748b">AI executive summary</div>
                        </td>
                    </tr>
                </table>
                <div style="font-size:13px;line-height:1.65;color:#334155;margin-top:16px">${cleanAI(aiSummary || '')}</div>
            </td></tr>
        </table>
    </td></tr>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniConnect ${modeLabel} Ops Report</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06)">
            <!-- Header -->
            <tr><td style="background:linear-gradient(135deg,${accent1} 0%,${accent2} 100%);padding:28px 28px 32px">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td valign="middle">
                            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1.5px">UniConnect · Ops Report</div>
                            <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:6px;letter-spacing:-0.5px">${modeLabel} Report</div>
                            <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px">${periodLabel}</div>
                        </td>
                        <td valign="middle" align="right">
                            <div style="background:rgba(255,255,255,0.18);backdrop-filter:blur(10px);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;color:#ffffff;display:inline-block">
                                ${attRate}% att · ${sessRate}% comp
                            </div>
                        </td>
                    </tr>
                </table>
            </td></tr>

            ${hasNoData ? `
            <!-- Empty state banner -->
            <tr><td style="padding:24px 28px 12px">
                <table width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#fefce8 0%,#ffffff 100%);border:1px solid #fde68a;border-radius:16px">
                    <tr><td style="padding:26px 28px" align="center">
                        <div style="width:52px;height:52px;border-radius:14px;background:#fef3c7;display:inline-block;line-height:52px;text-align:center;font-size:26px;font-weight:800;color:#b45309;margin-bottom:12px">!</div>
                        <div style="font-size:17px;font-weight:800;color:#92400e;margin-bottom:6px">No data recorded for this ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}</div>
                        <div style="font-size:13px;color:#b45309;line-height:1.55;max-width:440px;margin:0 auto">
                            <strong>${periodLabel}</strong> hasn't been synced yet. Pick a date in the ${mode === 'daily' ? 'past few days' : 'past few weeks'} that already has data, or sync the Google Sheet for this period from the dashboard.
                        </div>
                        <div style="margin-top:16px">
                            <a href="${dashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 20px;border-radius:10px">Go to dashboard</a>
                        </div>
                    </td></tr>
                </table>
            </td></tr>
            ` : `
            <!-- Hero KPI row -->
            <tr><td style="padding:22px 28px 6px">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">
                    Hero metrics ${attDelta !== null ? deltaChip(attDelta) : ''}
                </div>
            </td></tr>
            ${heroKPIs}

            <!-- Risk card (featured) -->
            ${sectionHeader('Risk & alerts', 'Attention needed')}
            ${riskCard(n(s.at_risk_total), n(s.at_risk_informed), n(s.enrolled))}

            <!-- Sessions + Actions -->
            ${sectionHeader('Operations', `${modeLabel} performance`)}
            ${card(sessionsContent)}
            ${card(actionsContent)}

            <!-- Engagement + Instructors -->
            ${card(engagementContent)}
            ${card(instructorsContent)}

            <!-- Events & Exams -->
            ${card(eventsContent)}

            <!-- Fee Collection (only renders if feeData supplied) -->
            ${renderFeeSection(feeData, accent1, dashboardUrl)}

            <!-- AI Insights -->
            ${sectionHeader('AI insights', 'Ops Copilot analysis')}
            ${aiSection}

            <!-- University table -->
            ${sectionHeader('University performance', `Top ${Math.min(byUniv.length, 10)} universities this ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}`)}
            <tr><td style="padding:0 28px 24px">
                <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
                    ${universityTable(byUniv)}
                </table>
            </td></tr>
            `}

            <!-- CTA -->
            <tr><td style="padding:0 28px 28px">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td align="center">
                            <table cellpadding="0" cellspacing="0"><tr>
                                <td style="padding-right:8px">
                                    <a href="${dashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 22px;border-radius:10px">Open Dashboard</a>
                                </td>
                                <td style="padding-left:8px">
                                    <a href="${reportUrl}" style="display:inline-block;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;padding:12px 22px;border-radius:10px">Full Report</a>
                                </td>
                            </tr></table>
                        </td>
                    </tr>
                </table>
            </td></tr>

            <!-- Footer -->
            <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc">
                <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="font-size:11px;color:#64748b">UniConnect · Ops Dashboard v2</td>
                        <td style="font-size:11px;color:#94a3b8;text-align:right">Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                </table>
            </td></tr>
        </table>
    </td></tr>
</table>
</body></html>`;
}
