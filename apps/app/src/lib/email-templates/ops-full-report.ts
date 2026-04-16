/**
 * Ops Full Report — a standalone, wide, print-friendly HTML page.
 * This is distinct from the email template: it's the "View Full Report"
 * destination that opens when users click the CTA in their inbox.
 * Uses SVG rings, multi-column grid, richer breakdowns.
 */

export type OpsReportMode = 'daily' | 'weekly' | 'monthly';

export interface OpsFullReportOptions {
    mode: OpsReportMode;
    periodLabel: string;
    report: any;
    aiSummary?: string;
    dashboardUrl: string;
    prevSummary?: any;
    budgetIntel?: any;
}

const n = (v: any) => {
    if (v === null || v === undefined) return 0;
    const num = Number(v);
    return Number.isFinite(num) ? Math.round(num) : 0;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmt = (v: any) => n(v).toLocaleString('en-IN');

function tone(value: number, good: number, warn: number) {
    if (value >= good) return '#059669';
    if (value >= warn) return '#d97706';
    return '#e11d48';
}

function cleanAI(txt: string): string {
    if (!txt) return '';
    return txt.replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function ring(percent: number, color: string, label: string, value: string, size = 180, stroke = 14): string {
    const r = size / 2 - stroke / 2;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, percent));
    const offset = c - (c * p) / 100;
    return `
<div style="position:relative;width:${size}px;height:${size}px;display:inline-block">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#f1f5f9" stroke-width="${stroke}" fill="none" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">${label}</div>
        <div style="font-size:${size >= 180 ? 34 : 26}px;font-weight:800;color:#0f172a;line-height:1;margin-top:4px;font-variant-numeric:tabular-nums">${value}</div>
    </div>
</div>`;
}

function statTile(label: string, value: string | number, hint: string, toneColor = '#0f172a'): string {
    return `
<div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;flex:1;min-width:0">
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">${label}</div>
    <div style="font-size:26px;font-weight:800;color:${toneColor};line-height:1;margin-top:6px;font-variant-numeric:tabular-nums">${value}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:3px">${hint}</div>
</div>`;
}

function bar(label: string, value: number, max: number, color: string, hint = ''): string {
    const p = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return `
<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <span style="font-size:12px;color:#475569;font-weight:500">${label}</span>
        <span style="font-size:12px;color:#0f172a;font-weight:700;font-variant-numeric:tabular-nums">${fmt(value)}${hint ? ` <span style="color:#94a3b8;font-weight:400">${hint}</span>` : ''}</span>
    </div>
    <div style="background:#f1f5f9;height:8px;border-radius:999px;overflow:hidden">
        <div style="background:${color};height:100%;width:${p}%;border-radius:999px"></div>
    </div>
</div>`;
}

function card(title: string, subtitle: string, inner: string, span = 4): string {
    return `
<section style="grid-column:span ${span};background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:22px 24px;box-shadow:0 1px 2px rgba(15,23,42,0.03)">
    <header style="margin-bottom:16px">
        <h3 style="margin:0;font-size:14px;font-weight:700;color:#0f172a;letter-spacing:-0.2px">${title}</h3>
        ${subtitle ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b">${subtitle}</p>` : ''}
    </header>
    ${inner}
</section>`;
}

function universityTable(rows: any[]): string {
    if (!rows || rows.length === 0) {
        return `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px">No university data for this period.</div>`;
    }
    const body = rows.map((r: any) => {
        const uAtt = pct(n(r.attended), n(r.enrolled));
        const uSess = pct(n(r.sessions_completed), n(r.sessions_planned));
        const attColor = tone(uAtt, 85, 75);
        const sessColor = tone(uSess, 90, 70);
        const atRiskColor = n(r.at_risk_total) > 0 ? '#e11d48' : '#64748b';
        return `
<tr>
    <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#0f172a">${r.university_name || '—'}</td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">
        <span style="font-weight:700;color:${sessColor}">${uSess}%</span>
        <span style="color:#94a3b8;font-size:11px;margin-left:6px">${n(r.sessions_completed)}/${n(r.sessions_planned)}</span>
    </td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;font-variant-numeric:tabular-nums">${fmt(r.enrolled)}</td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;font-variant-numeric:tabular-nums">${fmt(r.attended)}</td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">
        <span style="font-weight:700;color:${attColor}">${n(r.enrolled) > 0 ? uAtt + '%' : '—'}</span>
    </td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:${atRiskColor};font-weight:600;font-variant-numeric:tabular-nums">${n(r.at_risk_total) || '—'}</td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#475569;font-variant-numeric:tabular-nums">${n(r.coach_calls) + n(r.parent_calls)}</td>
    <td style="padding:12px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:${n(r.sessions_cancelled) > 0 ? '#e11d48' : '#94a3b8'};font-variant-numeric:tabular-nums">${fmt(r.sessions_cancelled)}</td>
</tr>`;
    }).join('');
    return `
<div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:14px">
<table style="width:100%;border-collapse:collapse;background:#ffffff">
    <thead>
        <tr style="background:#f8fafc">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">University</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Sessions</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Enrolled</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Attended</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Attendance</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">At-risk</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Calls</th>
            <th style="padding:12px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e2e8f0">Cancelled</th>
        </tr>
    </thead>
    <tbody>${body}</tbody>
</table>
</div>`;
}

function remarksList(rows: any[]): string {
    const notes = (rows || [])
        .map((r: any) => ({ ...r, _note: r.remarks || r.cancellation_reason || '' }))
        .filter((r: any) => r._note && String(r._note).trim().length > 0)
        .slice(0, 10);
    if (notes.length === 0) {
        return `<div style="padding:14px;background:#f8fafc;border-radius:10px;color:#64748b;font-size:13px;font-style:italic">No remarks logged for this period.</div>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:10px">${notes.map((r: any) => `
<div style="display:flex;gap:12px;padding:14px 16px;background:#f8fafc;border-radius:12px;border-left:3px solid ${r.cancellation_reason && !r.remarks ? '#f59e0b' : '#6366f1'}">
    <div style="flex-shrink:0">
        <div style="width:36px;height:36px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#64748b;display:flex;align-items:center;justify-content:center">
            ${r.date ? new Date(r.date).getDate() : '—'}
        </div>
    </div>
    <div style="flex:1;min-width:0">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
            <span style="font-size:12px;font-weight:600;color:#0f172a">${r.university_name || '—'}</span>
            ${r.date ? `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:#e2e8f0;color:#475569">${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>` : ''}
            ${r.cancellation_reason && !r.remarks ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;text-transform:uppercase;letter-spacing:0.5px">Cancellation</span>` : ''}
        </div>
        <p style="margin:6px 0 0;font-size:13px;color:#334155;line-height:1.5">${r._note}</p>
    </div>
</div>`).join('')}</div>`;
}

function money(v: any): string {
    const num = Number(v);
    if (!Number.isFinite(num) || num === 0) return '—';
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
    return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

function statusBadge(status: string): string {
    const s = (status || '').toUpperCase();
    const map: Record<string, { bg: string; fg: string; label: string }> = {
        'PROPOSED':          { bg: '#eff6ff', fg: '#1d4ed8', label: 'Proposed' },
        'PENDING_APPROVAL':  { bg: '#fef9c3', fg: '#854d0e', label: 'Pending' },
        'APPROVED':          { bg: '#d1fae5', fg: '#065f46', label: 'Approved' },
        'REJECTED':          { bg: '#fee2e2', fg: '#991b1b', label: 'Rejected' },
        'EVENT_COMPLETED':   { bg: '#e0e7ff', fg: '#3730a3', label: 'Completed' },
        'REPORT_SUBMITTED':  { bg: '#f5f3ff', fg: '#6d28d9', label: 'Reported' },
        'CLOSED':            { bg: '#f1f5f9', fg: '#475569', label: 'Closed' },
    };
    const m = map[s] || { bg: '#f1f5f9', fg: '#475569', label: s || '—' };
    return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;background:${m.bg};color:${m.fg};text-transform:uppercase;letter-spacing:0.5px">${m.label}</span>`;
}

function renderBudgetSection(mode: OpsReportMode, budgetIntel: any, accent1: string): string {
    if (!budgetIntel || !budgetIntel.events || budgetIntel.events.length === 0) {
        return `
<section style="grid-column:span 12">
    <header style="margin-bottom:14px">
        <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">Budget & proposals</h2>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b">${mode === 'daily' ? 'Proposals submitted today' : mode === 'weekly' ? 'Proposals this week' : 'Proposals this month'}</p>
    </header>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;text-align:center;color:#94a3b8;font-size:13px">No budget proposals in this period.</div>
</section>`;
    }

    const events = budgetIntel.events || [];
    const ag = budgetIntel.aggregates || {};

    // Per-university totals (what university spent/requested, and a breakdown of reasons)
    type UnivBudget = {
        name: string;
        proposals: number;
        requested: number;
        approved: number;
        spent: number;
        events: Array<{ title: string; type: string; amount: number; status: string; date?: string; outcomes?: string; issues?: string }>;
    };
    const byUniv = new Map<string, UnivBudget>();
    let totalProposals = 0, totalRequested = 0, totalApproved = 0, totalSpent = 0;
    for (const e of events) {
        const key = e.university_name || '—';
        if (!byUniv.has(key)) {
            byUniv.set(key, { name: key, proposals: 0, requested: 0, approved: 0, spent: 0, events: [] });
        }
        const u = byUniv.get(key)!;
        const req = Number(e.estimated_total_budget) || 0;
        const apr = Number(e.approved_total_budget) || 0;
        const act = Number(e.actual_budget_used) || 0;
        u.proposals += 1;
        u.requested += req;
        u.approved += apr;
        u.spent += act;
        u.events.push({
            title: e.title || 'Untitled',
            type: e.event_type || '—',
            amount: act || apr || req,
            status: e.status || '',
            date: e.proposed_date ? new Date(e.proposed_date).toISOString().split('T')[0] : undefined,
            outcomes: e.outcomes || '',
            issues: e.issues_faced || ''
        });
        totalProposals += 1;
        totalRequested += req;
        totalApproved += apr;
        totalSpent += act;
    }

    const universities = Array.from(byUniv.values()).sort((a, b) => b.spent - a.spent || b.requested - a.requested);

    // Event-type breakdown ("what it was spent on")
    const byTypeMap = new Map<string, { type: string; count: number; spent: number }>();
    for (const e of events) {
        const key = e.event_type || 'other';
        if (!byTypeMap.has(key)) byTypeMap.set(key, { type: key, count: 0, spent: 0 });
        const t = byTypeMap.get(key)!;
        t.count += 1;
        t.spent += Number(e.actual_budget_used) || 0;
    }
    const byType = Array.from(byTypeMap.values()).sort((a, b) => b.spent - a.spent);
    const maxTypeSpend = Math.max(1, ...byType.map(t => t.spent));

    const summaryRow = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
    ${statTile('Proposals', totalProposals.toString(), `${mode === 'daily' ? 'today' : mode === 'weekly' ? 'this week' : 'this month'}`)}
    ${statTile('Requested', money(totalRequested), 'Total ask')}
    ${statTile('Approved', money(totalApproved), 'Sanctioned')}
    ${statTile('Spent', money(totalSpent), `${ag.eventsWithReports || 0} with reports`, tone(ag.avgBudgetUtilization || 0, 85, 100) === '#e11d48' ? '#e11d48' : '#0f172a')}
</div>`;

    const avgRow = ag.avgBudgetUtilization || ag.avgCostPerParticipant ? `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px">
    <div style="padding:14px 16px;background:#f8fafc;border-radius:12px">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Avg budget utilization</div>
        <div style="font-size:22px;font-weight:800;color:${tone(100 - Math.abs((ag.avgBudgetUtilization || 0) - 100), 85, 70)};margin-top:4px;font-variant-numeric:tabular-nums">${ag.avgBudgetUtilization || 0}%</div>
    </div>
    <div style="padding:14px 16px;background:#f8fafc;border-radius:12px">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Avg cost / participant</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px;font-variant-numeric:tabular-nums">${money(ag.avgCostPerParticipant)}</div>
    </div>
    <div style="padding:14px 16px;background:#f8fafc;border-radius:12px">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Attendance accuracy</div>
        <div style="font-size:22px;font-weight:800;color:${tone(ag.avgAttendanceAccuracy || 0, 85, 70)};margin-top:4px;font-variant-numeric:tabular-nums">${ag.avgAttendanceAccuracy || 0}%</div>
    </div>
</div>` : '';

    // Daily: list each proposal as a row of details.
    if (mode === 'daily') {
        const cards = events.slice(0, 12).map((e: any) => {
            const spent = Number(e.actual_budget_used) || 0;
            const req = Number(e.estimated_total_budget) || 0;
            const apr = Number(e.approved_total_budget) || 0;
            return `
<article style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start">
    <div style="min-width:0">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px">
            <span style="font-size:14px;font-weight:700;color:#0f172a">${e.title || 'Untitled proposal'}</span>
            ${statusBadge(e.status)}
            <span style="font-size:11px;font-weight:600;color:#64748b">${e.event_type || '—'}</span>
        </div>
        <div style="font-size:12px;color:#64748b">${e.university_name || '—'}${e.proposed_date ? ` · ${new Date(e.proposed_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</div>
        ${e.outcomes ? `<div style="margin-top:8px;padding:10px 12px;background:#f0fdf4;border-left:3px solid #10b981;border-radius:8px;font-size:12px;color:#14532d"><strong style="color:#065f46">Outcome:</strong> ${e.outcomes}</div>` : ''}
        ${e.issues_faced ? `<div style="margin-top:6px;padding:10px 12px;background:#fef2f2;border-left:3px solid #f43f5e;border-radius:8px;font-size:12px;color:#7f1d1d"><strong style="color:#991b1b">Issues:</strong> ${e.issues_faced}</div>` : ''}
    </div>
    <div style="text-align:right;min-width:140px">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">${spent > 0 ? 'Spent' : apr > 0 ? 'Approved' : 'Requested'}</div>
        <div style="font-size:22px;font-weight:800;color:${spent > req && req > 0 ? '#e11d48' : '#0f172a'};margin-top:2px;font-variant-numeric:tabular-nums">${money(spent || apr || req)}</div>
        ${req > 0 && spent > 0 ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">of ${money(req)} est.</div>` : ''}
        ${e.expected_attendance ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px">${e.actual_attendance || '—'} / ${e.expected_attendance} attendees</div>` : ''}
    </div>
</article>`;
        }).join('');
        return `
<section style="grid-column:span 12">
    <header style="margin-bottom:14px">
        <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">Budget & proposals</h2>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b">Proposals submitted on this date · ${totalProposals} total</p>
    </header>
    ${summaryRow}
    <div style="display:flex;flex-direction:column;gap:12px">${cards}</div>
</section>`;
    }

    // Weekly / Monthly: aggregate view with breakdowns.
    const typeBars = byType.map((t) => {
        const p = Math.max(0, Math.min(100, (t.spent / maxTypeSpend) * 100));
        return `
<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <span style="font-size:12px;color:#475569;font-weight:600;text-transform:capitalize">${t.type.replace(/_/g, ' ')} <span style="color:#94a3b8;font-weight:400">· ${t.count} event${t.count > 1 ? 's' : ''}</span></span>
        <span style="font-size:13px;color:#0f172a;font-weight:700;font-variant-numeric:tabular-nums">${money(t.spent)}</span>
    </div>
    <div style="background:#f1f5f9;height:10px;border-radius:999px;overflow:hidden">
        <div style="background:linear-gradient(90deg,${accent1},${accent1}cc);height:100%;width:${p}%;border-radius:999px"></div>
    </div>
</div>`;
    }).join('');

    // Per-university rows (expandable <details> so users can click to see the breakdown of reasons)
    const univRows = universities.slice(0, 12).map((u) => {
        const eventList = u.events.map(ev => `
<li style="display:flex;justify-content:space-between;gap:14px;padding:10px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-top:6px">
    <div style="min-width:0;flex:1">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
            <span style="font-size:13px;font-weight:600;color:#0f172a">${ev.title}</span>
            ${statusBadge(ev.status)}
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:capitalize">${ev.type.replace(/_/g, ' ')}${ev.date ? ` · ${new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</div>
        ${ev.outcomes ? `<div style="font-size:11px;color:#065f46;margin-top:3px"><strong>✓</strong> ${ev.outcomes.slice(0, 140)}${ev.outcomes.length > 140 ? '…' : ''}</div>` : ''}
        ${ev.issues ? `<div style="font-size:11px;color:#991b1b;margin-top:3px"><strong>!</strong> ${ev.issues.slice(0, 140)}${ev.issues.length > 140 ? '…' : ''}</div>` : ''}
    </div>
    <div style="text-align:right;white-space:nowrap">
        <div style="font-size:14px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums">${money(ev.amount)}</div>
    </div>
</li>`).join('');

        return `
<details style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
    <summary style="cursor:pointer;list-style:none;padding:16px 20px;display:grid;grid-template-columns:1fr auto auto auto auto;gap:16px;align-items:center;font-weight:600">
        <div style="min-width:0">
            <div style="font-size:14px;font-weight:700;color:#0f172a">${u.name}</div>
            <div style="font-size:11px;color:#64748b">${u.proposals} proposal${u.proposals > 1 ? 's' : ''} · click to see breakdown</div>
        </div>
        <div style="text-align:right">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px">Requested</div>
            <div style="font-size:14px;font-weight:700;color:#475569;font-variant-numeric:tabular-nums">${money(u.requested)}</div>
        </div>
        <div style="text-align:right">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px">Approved</div>
            <div style="font-size:14px;font-weight:700;color:#0369a1;font-variant-numeric:tabular-nums">${money(u.approved)}</div>
        </div>
        <div style="text-align:right">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px">Spent</div>
            <div style="font-size:16px;font-weight:800;color:${u.spent > u.approved && u.approved > 0 ? '#e11d48' : '#0f172a'};font-variant-numeric:tabular-nums">${money(u.spent)}</div>
        </div>
        <div style="color:#64748b;font-size:16px">▾</div>
    </summary>
    <div style="padding:0 16px 16px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <ul style="list-style:none;padding:12px 0 0;margin:0">${eventList}</ul>
    </div>
</details>`;
    }).join('');

    return `
<section style="grid-column:span 12">
    <header style="margin-bottom:14px">
        <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">Budget & proposals</h2>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b">${mode === 'weekly' ? 'Total spend and breakdown for the week' : 'Total spend and breakdown for the month'} · ${totalProposals} proposal${totalProposals === 1 ? '' : 's'}</p>
    </header>
    ${summaryRow}
    ${avgRow}
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-bottom:18px">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:20px">
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:14px">Spent by event type</div>
            ${typeBars || '<div style="font-size:12px;color:#94a3b8;padding:16px 0">No categorized spend yet.</div>'}
        </div>
        <div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:10px;padding-left:4px">By university <span style="font-weight:400;color:#64748b">· click any row to expand reasons</span></div>
            <div style="display:flex;flex-direction:column;gap:8px">${univRows}</div>
        </div>
    </div>
</section>`;
}

export function buildOpsFullReportHtml(opts: OpsFullReportOptions): string {
    const { mode, periodLabel, report, aiSummary, dashboardUrl, prevSummary, budgetIntel } = opts;
    const s = report?.summary || {};
    const byUniv = report?.byUniversity || [];
    const dailyBreakdown = report?.dailyBreakdown || [];

    const attRate = pct(n(s.attended), n(s.enrolled));
    const sessRate = pct(n(s.sessions_completed), n(s.sessions_planned));
    const callsTotal = n(s.coach_calls) + n(s.parent_calls);
    const engTarget = Math.max(n(s.enrolled) * 0.3, 10);
    const engRate = Math.min(100, pct(callsTotal, engTarget));

    const modeLabel = mode === 'daily' ? 'Daily' : mode === 'weekly' ? 'Weekly' : 'Monthly';
    const accent1 = mode === 'daily' ? '#0ea5e9' : mode === 'weekly' ? '#8b5cf6' : '#10b981';
    const accent2 = mode === 'daily' ? '#6366f1' : mode === 'weekly' ? '#ec4899' : '#0ea5e9';

    const hasNoData =
        n(s.enrolled) === 0 && n(s.sessions_planned) === 0 &&
        n(s.sessions_completed) === 0 && n(s.coach_calls) === 0 &&
        n(s.parent_calls) === 0 && n(s.at_risk_total) === 0 &&
        n(s.events_planned) === 0 && n(s.exams_planned) === 0 &&
        byUniv.length === 0;

    // deltas
    let attDelta: number | null = null;
    if (prevSummary) {
        const pAtt = pct(n(prevSummary.attended), n(prevSummary.enrolled));
        attDelta = attRate - pAtt;
    }

    // Sorted universities for the table (by attendance)
    const sortedUniv = [...byUniv]
        .map((u: any) => ({ ...u, _att: pct(n(u.attended), n(u.enrolled)) }))
        .sort((a: any, b: any) => (b._att - a._att) || (n(b.enrolled) - n(a.enrolled)));

    const emptyState = `
<section style="grid-column:span 12;background:linear-gradient(135deg,#fefce8 0%,#ffffff 100%);border:1px solid #fde68a;border-radius:20px;padding:40px;text-align:center">
    <div style="width:60px;height:60px;border-radius:16px;background:#fef3c7;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#b45309;margin-bottom:16px">!</div>
    <h2 style="margin:0;font-size:22px;font-weight:800;color:#92400e">No data recorded for this ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}</h2>
    <p style="margin:8px auto 0;max-width:520px;font-size:14px;color:#b45309;line-height:1.6">
        <strong>${periodLabel}</strong> hasn't been synced yet. Pick a date with data or go to the dashboard to sync the Google Sheet for this period.
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:12px">Open dashboard</a>
</section>`;

    const content = hasNoData ? emptyState : `
<!-- Hero row -->
<section style="grid-column:span 12;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:32px;display:grid;grid-template-columns:auto 1fr;gap:36px;align-items:center">
    <div style="text-align:center">
        ${ring(attRate, accent1, 'Attendance', attRate + '%', 200, 16)}
    </div>
    <div>
        <div style="display:flex;gap:12px;align-items:baseline;margin-bottom:20px;flex-wrap:wrap">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px">${modeLabel} headline</div>
            ${attDelta !== null && attDelta !== 0 ? `<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;background:${attDelta > 0 ? '#d1fae5' : '#ffe4e6'};color:${attDelta > 0 ? '#059669' : '#e11d48'}">${attDelta > 0 ? '↑ +' : '↓ '}${Math.abs(attDelta).toFixed(1)}% vs prev</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            ${statTile('Enrolled', fmt(s.enrolled), `${fmt(s.attended)} attended`)}
            ${statTile('Sessions', fmt(s.sessions_completed), `of ${fmt(s.sessions_planned)} planned`, tone(sessRate, 90, 70))}
            ${statTile('At-risk', fmt(s.at_risk_total), `${fmt(s.at_risk_informed)} informed`, n(s.at_risk_total) > 0 ? '#e11d48' : '#059669')}
            ${statTile('Engagement', callsTotal + ' calls', `${fmt(s.coach_calls)} student · ${fmt(s.parent_calls)} parent`, '#8b5cf6')}
        </div>
    </div>
</section>

<!-- Risk alert (full width) -->
<section style="grid-column:span 12;background:linear-gradient(135deg,#fff1f2 0%,#ffffff 100%);border:1px solid #fecdd3;border-radius:20px;padding:28px 32px;display:grid;grid-template-columns:64px 1fr auto;gap:20px;align-items:center">
    <div style="width:52px;height:52px;border-radius:14px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#e11d48">!</div>
    <div>
        <div style="font-size:11px;font-weight:700;color:#9f1239;text-transform:uppercase;letter-spacing:1.5px">Attendance risk</div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-top:4px;flex-wrap:wrap">
            <div style="font-size:34px;font-weight:800;color:#e11d48;line-height:1;font-variant-numeric:tabular-nums">${fmt(s.at_risk_total)}</div>
            <div style="font-size:14px;color:#9f1239">Students below 75% attendance · ${pct(n(s.at_risk_total), n(s.enrolled))}% of cohort</div>
        </div>
        ${n(s.at_risk_total) > 0 ? `
        <div style="margin-top:12px">
            <div style="font-size:11px;font-weight:600;color:#9f1239;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Follow-through: ${fmt(s.at_risk_informed)} of ${fmt(s.at_risk_total)} informed · ${fmt(s.acknowledgments)} acknowledged</div>
            <div style="background:#fecdd3;height:10px;border-radius:999px;overflow:hidden">
                <div style="background:linear-gradient(90deg,#f43f5e,#e11d48);height:100%;width:${pct(n(s.at_risk_informed), n(s.at_risk_total))}%"></div>
            </div>
        </div>` : ''}
    </div>
    <div style="text-align:right">
        <div style="font-size:12px;color:#9f1239">Cancellations</div>
        <div style="font-size:28px;font-weight:800;color:${n(s.sessions_cancelled) > 0 ? '#e11d48' : '#64748b'};font-variant-numeric:tabular-nums">${fmt(s.sessions_cancelled)}</div>
        <div style="font-size:11px;color:#9f1239">${fmt(s.events_cancelled)} events cancelled</div>
    </div>
</section>

<!-- Sessions / Engagement / Instructors -->
${card('Sessions breakdown', `${modeLabel} performance`, `
    ${bar('Completed', n(s.sessions_completed), Math.max(n(s.sessions_planned), 1), '#10b981', `of ${fmt(s.sessions_planned)}`)}
    ${bar('Cancelled', n(s.sessions_cancelled), Math.max(n(s.sessions_planned), 1), '#f43f5e', '')}
    ${bar('Remaining', Math.max(0, n(s.sessions_planned) - n(s.sessions_completed) - n(s.sessions_cancelled)), Math.max(n(s.sessions_planned), 1), '#a1a1aa', '')}
    ${s.cancellation_reason ? `
    <div style="margin-top:16px;padding:12px 14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.7px">Reason</div>
        <div style="font-size:13px;color:#78350f;margin-top:3px">${s.cancellation_reason}</div>
    </div>` : ''}
`, 4)}

${card('Engagement', 'Success coach outreach', `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="background:#eff6ff;border-radius:14px;padding:18px;text-align:center">
        <div style="font-size:32px;font-weight:800;color:#0ea5e9;line-height:1;font-variant-numeric:tabular-nums">${fmt(s.coach_calls)}</div>
        <div style="font-size:11px;font-weight:700;color:#64748b;margin-top:6px;text-transform:uppercase;letter-spacing:0.7px">Student calls</div>
    </div>
    <div style="background:#f5f3ff;border-radius:14px;padding:18px;text-align:center">
        <div style="font-size:32px;font-weight:800;color:#8b5cf6;line-height:1;font-variant-numeric:tabular-nums">${fmt(s.parent_calls)}</div>
        <div style="font-size:11px;font-weight:700;color:#64748b;margin-top:6px;text-transform:uppercase;letter-spacing:0.7px">Parent calls</div>
    </div>
</div>
<div style="margin-top:14px">
    ${bar('Engagement rate', engRate, 100, '#8b5cf6', '% of target')}
</div>
`, 4)}

${card('Instructors', 'Workforce availability', `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
    <div style="padding:14px 8px">
        <div style="font-size:26px;font-weight:800;color:#0f172a;line-height:1;font-variant-numeric:tabular-nums">${fmt(s.instructors_total)}</div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.7px">Total</div>
    </div>
    <div style="padding:14px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
        <div style="font-size:26px;font-weight:800;color:${n(s.instructors_on_leave) > 0 ? '#d97706' : '#64748b'};line-height:1;font-variant-numeric:tabular-nums">${fmt(s.instructors_on_leave)}</div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.7px">On leave</div>
    </div>
    <div style="padding:14px 8px">
        <div style="font-size:26px;font-weight:800;color:#059669;line-height:1;font-variant-numeric:tabular-nums">${fmt(Math.max(0, n(s.instructors_total) - n(s.instructors_on_leave)))}</div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.7px">Active</div>
    </div>
</div>
<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9">
    ${bar('Availability', n(s.instructors_total) > 0 ? Math.round((n(s.instructors_total) - n(s.instructors_on_leave)) / n(s.instructors_total) * 100) : 0, 100, '#10b981', '%')}
</div>
`, 4)}

<!-- Events & Exams / Actions -->
${card('Events & Exams', 'Planned vs completed', `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div>
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px">Events</div>
        ${bar('Planned', n(s.events_planned), Math.max(n(s.events_planned), 1), '#94a3b8', '')}
        ${bar('Completed', n(s.events_executed), Math.max(n(s.events_planned), 1), '#10b981', '')}
        ${bar('Cancelled', n(s.events_cancelled), Math.max(n(s.events_planned), 1), '#f43f5e', '')}
    </div>
    <div>
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px">Exams</div>
        ${bar('Planned', n(s.exams_planned), Math.max(n(s.exams_planned), 1), '#94a3b8', '')}
        ${bar('Completed', n(s.exams_completed), Math.max(n(s.exams_planned), 1), '#10b981', '')}
        ${bar('Post-exam comms', n(s.post_exam_comms_sent), Math.max(n(s.exams_completed), 1), '#8b5cf6', '')}
    </div>
</div>
`, 8)}

${card('Actions taken', 'Follow-through on risk', `
    ${bar('Students informed', n(s.at_risk_informed), Math.max(n(s.at_risk_total), 1), '#0ea5e9', n(s.at_risk_total) > 0 ? `of ${fmt(s.at_risk_total)}` : '')}
    ${bar('Parents contacted', n(s.parent_calls), Math.max(n(s.parent_calls), 1), '#8b5cf6', '')}
    ${bar('Acknowledgments', n(s.acknowledgments), Math.max(n(s.at_risk_informed), 1), '#10b981', n(s.at_risk_informed) > 0 ? `of ${fmt(s.at_risk_informed)}` : '')}
`, 4)}

<!-- AI insights -->
${aiSummary ? `
<section style="grid-column:span 12;background:linear-gradient(135deg,${accent1}12 0%,${accent2}12 100%);border:1px solid ${accent1}30;border-radius:20px;padding:28px 32px">
    <header style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
        <div style="width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,${accent1},${accent2});display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:18px;font-weight:800">✦</div>
        <div>
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Ops Copilot</h3>
            <p style="margin:0;font-size:11px;color:#64748b">AI executive summary</p>
        </div>
    </header>
    <div style="font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap">${cleanAI(aiSummary)}</div>
</section>
` : ''}

<!-- Budget & proposals -->
${renderBudgetSection(mode, budgetIntel, accent1)}

<!-- University table (full width) -->
<section style="grid-column:span 12">
    <header style="margin-bottom:14px">
        <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">University performance</h2>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b">Ranked by attendance · ${sortedUniv.length} universities in this ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}</p>
    </header>
    ${universityTable(sortedUniv)}
</section>

<!-- Remarks timeline -->
<section style="grid-column:span 12">
    <header style="margin-bottom:14px">
        <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">Remarks & notes</h2>
        <p style="margin:3px 0 0;font-size:13px;color:#64748b">Qualitative input from the field</p>
    </header>
    ${remarksList(dailyBreakdown.length > 0 ? dailyBreakdown : byUniv)}
</section>
`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>UniConnect ${modeLabel} Report — ${periodLabel}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; color: #0f172a; -webkit-font-smoothing: antialiased; }
        .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; }
        .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 20px; }
        @media (max-width: 1024px) { .grid { grid-template-columns: repeat(6, 1fr); } section { grid-column: span 6 !important; } }
        @media (max-width: 640px) { .grid { grid-template-columns: repeat(1, 1fr); gap: 14px; } section { grid-column: span 1 !important; } }
        @media print {
            body { background: #ffffff; }
            .wrap { padding: 0; max-width: 100%; }
            .no-print { display: none !important; }
            section { break-inside: avoid; box-shadow: none !important; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <!-- Header -->
        <header style="background:linear-gradient(135deg,${accent1} 0%,${accent2} 100%);border-radius:24px;padding:36px 40px;color:#ffffff;margin-bottom:24px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;box-shadow:0 10px 40px ${accent1}33">
            <div>
                <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);padding:6px 12px;border-radius:999px;margin-bottom:14px">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px">UniConnect · Ops Report</span>
                </div>
                <h1 style="margin:0;font-size:32px;font-weight:800;letter-spacing:-0.8px;line-height:1.1">${modeLabel} Report</h1>
                <p style="margin:6px 0 0;font-size:15px;opacity:0.9">${periodLabel}</p>
            </div>
            <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
                <a href="${dashboardUrl}" style="background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.3)">Open Dashboard</a>
                <a href="javascript:window.print()" style="background:#ffffff;color:${accent1};text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:10px">Print / Save PDF</a>
            </div>
        </header>

        <!-- Content grid -->
        <div class="grid">
            ${content}
        </div>

        <!-- Footer -->
        <footer class="no-print" style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:12px;color:#64748b;flex-wrap:wrap;gap:10px">
            <div>UniConnect · Ops Dashboard v2</div>
            <div>Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </footer>
    </div>
</body>
</html>`;
}
