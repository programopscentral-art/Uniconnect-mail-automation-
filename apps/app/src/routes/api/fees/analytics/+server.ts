/**
 * Standalone Fee Analytics page — wide, print-friendly HTML with charts.
 * Linked from the "View Fee Analytics" button in ops report emails.
 *
 * GET /api/fees/analytics?period_id=<uuid>
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
    getFeeOverallSummary,
    getFeeUniversityRollup,
    getActiveFeePeriod,
    db,
} from '@uniconnect/shared';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    let periodId = url.searchParams.get('period_id') || '';
    if (!periodId) {
        const active = await getActiveFeePeriod();
        if (!active) throw error(404, 'No active fee period');
        periodId = active.id;
    }

    const [summary, byUniv, tagCounts, periodInfo] = await Promise.all([
        getFeeOverallSummary(periodId),
        getFeeUniversityRollup(periodId),
        db.query(
            `SELECT tag, COUNT(*)::int AS count
             FROM fee_student_tags t
             JOIN fee_student_payments sp ON sp.id = t.student_payment_id
             WHERE sp.period_id = $1
             GROUP BY tag ORDER BY count DESC`,
            [periodId]
        ),
        db.query(`SELECT name, batch_start_year, batch_end_year, term FROM fee_periods WHERE id = $1`, [periodId]),
    ]);

    const period = periodInfo.rows[0] || { name: 'Active Period' };
    const baseUrl = new URL(url).origin;
    const html = buildFeeAnalyticsHtml({ summary, byUniv, tagCounts: tagCounts.rows, period, baseUrl });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};

const fmt = (n: any) => {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(2) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(2) + ' L';
    if (num >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
};
const n = (v: any) => Number(v) || 0;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

function ringSVG(percent: number, size = 180, stroke = 18, color = '#A52D2D', label = '', valueLabel = '') {
    const r = size / 2 - stroke / 2;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, percent));
    const offset = c - (c * p) / 100;
    return `
<div style="position:relative;width:${size}px;height:${size}px;display:inline-block">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#f0e8d8" stroke-width="${stroke}" fill="none" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Georgia,serif">
        <div style="font-size:11px;font-weight:700;color:#8a6d3b;text-transform:uppercase;letter-spacing:2px">${label}</div>
        <div style="font-size:36px;font-weight:700;color:#1a1a1a;line-height:1;margin-top:4px">${valueLabel}</div>
    </div>
</div>`;
}

function barChartSVG(items: { label: string; value: number; max: number; color?: string }[], height = 220) {
    if (!items.length) return '<div style="padding:32px;text-align:center;color:#999">No data</div>';
    const W = 720;
    const barW = Math.min(36, (W - 60) / items.length - 8);
    const maxVal = Math.max(...items.map(i => i.max || i.value), 1);
    const chartH = height - 40;
    const bars = items.map((it, i) => {
        const h = Math.max(2, (it.value / maxVal) * chartH);
        const x = 40 + i * ((W - 60) / items.length) + ((W - 60) / items.length - barW) / 2;
        const y = chartH - h + 10;
        const color = it.color || '#A52D2D';
        const labelShort = it.label.length > 9 ? it.label.slice(0, 9) + '…' : it.label;
        return `
            <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${color}" />
            <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-family="Georgia,serif" font-size="9" font-weight="700" fill="#1a1a1a">${it.value > 0 ? fmt(it.value).replace('₹', '') : ''}</text>
            <text x="${x + barW / 2}" y="${chartH + 24}" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#666">${labelShort}</text>
        `;
    }).join('');
    return `<svg width="100%" viewBox="0 0 ${W} ${height}" style="max-width:100%">
        <line x1="40" y1="10" x2="40" y2="${chartH + 10}" stroke="#e0d8c8" stroke-width="1"/>
        <line x1="40" y1="${chartH + 10}" x2="${W - 10}" y2="${chartH + 10}" stroke="#e0d8c8" stroke-width="1"/>
        ${bars}
    </svg>`;
}

function stackedBarSVG(rows: { name: string; full: number; partial: number; nullc: number }[], height = 280) {
    if (!rows.length) return '<div style="padding:32px;text-align:center;color:#999">No data</div>';
    const W = 720;
    const barW = Math.min(28, (W - 60) / rows.length - 6);
    const maxTotal = Math.max(...rows.map(r => r.full + r.partial + r.nullc), 1);
    const chartH = height - 60;
    const bars = rows.map((r, i) => {
        const total = r.full + r.partial + r.nullc;
        const totalH = Math.max(2, (total / maxTotal) * chartH);
        const fullH = (r.full / Math.max(1, total)) * totalH;
        const partH = (r.partial / Math.max(1, total)) * totalH;
        const nullH = (r.nullc / Math.max(1, total)) * totalH;
        const x = 40 + i * ((W - 60) / rows.length) + ((W - 60) / rows.length - barW) / 2;
        const baseY = chartH + 10;
        const yFull = baseY - fullH;
        const yPart = yFull - partH;
        const yNull = yPart - nullH;
        const labelShort = r.name.length > 9 ? r.name.slice(0, 9) + '…' : r.name;
        return `
            <rect x="${x}" y="${yFull}" width="${barW}" height="${fullH}" fill="#0f7a3f"/>
            <rect x="${x}" y="${yPart}" width="${barW}" height="${partH}" fill="#d4af37"/>
            <rect x="${x}" y="${yNull}" width="${barW}" height="${nullH}" fill="#A52D2D"/>
            <text x="${x + barW / 2}" y="${baseY - totalH - 6}" text-anchor="middle" font-family="Georgia,serif" font-size="9" font-weight="700" fill="#1a1a1a">${total}</text>
            <text x="${x + barW / 2}" y="${chartH + 26}" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#666" transform="rotate(0)">${labelShort}</text>
        `;
    }).join('');
    return `<svg width="100%" viewBox="0 0 ${W} ${height}" style="max-width:100%">
        ${bars}
        <line x1="40" y1="10" x2="40" y2="${chartH + 10}" stroke="#e0d8c8" stroke-width="1"/>
        <line x1="40" y1="${chartH + 10}" x2="${W - 10}" y2="${chartH + 10}" stroke="#e0d8c8" stroke-width="1"/>
        <!-- Legend -->
        <g transform="translate(40, ${height - 16})">
            <rect x="0" y="-8" width="12" height="10" fill="#0f7a3f"/>
            <text x="16" y="0" font-family="Georgia,serif" font-size="11" fill="#1a1a1a">Fully Paid</text>
            <rect x="100" y="-8" width="12" height="10" fill="#d4af37"/>
            <text x="116" y="0" font-family="Georgia,serif" font-size="11" fill="#1a1a1a">Partial</text>
            <rect x="180" y="-8" width="12" height="10" fill="#A52D2D"/>
            <text x="196" y="0" font-family="Georgia,serif" font-size="11" fill="#1a1a1a">Not Paid</text>
        </g>
    </svg>`;
}

function buildFeeAnalyticsHtml(data: { summary: any; byUniv: any[]; tagCounts: any[]; period: any; baseUrl?: string }): string {
    const s = data.summary || {};
    const eff = Number(s.avg_efficiency || 0);
    const totalStudents = n(s.fully_paid) + n(s.partial_paid) + n(s.not_paid);
    const fullyPct = totalStudents > 0 ? Math.round((n(s.fully_paid) / totalStudents) * 100) : 0;

    // Sort universities by efficiency
    const sortedByEff = [...data.byUniv].sort((a: any, b: any) => Number(b.collection_efficiency) - Number(a.collection_efficiency));
    const top5 = sortedByEff.slice(0, 5);
    const bottom5 = [...sortedByEff].reverse().slice(0, 5);

    const tagMap: Record<string, { label: string; color: string }> = {
        loan: { label: 'Loan', color: '#3b82f6' },
        dropout: { label: 'Dropout', color: '#A52D2D' },
        waiver: { label: 'Waiver', color: '#d4af37' },
        scholar: { label: 'Scholarship', color: '#0f7a3f' },
        defer: { label: 'Deferral', color: '#7c3aed' },
        will_pay: { label: 'Will Pay', color: '#ea580c' },
        other: { label: 'Other', color: '#666' },
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Fee Collection Analytics — NIAT</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #f6f5f3; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif; }
        .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; }
        h1 { font-family: Georgia, serif; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; color: #A52D2D; margin: 0; }
        h2 { font-family: Georgia, serif; font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 28px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #A52D2D; }
        h3 { font-family: Georgia, serif; font-size: 14px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px; }
        .card { background: #ffffff; border: 1px solid #e8e4dd; border-radius: 4px; padding: 24px; box-shadow: 0 1px 3px rgba(165,45,45,0.05); }
        .grid { display: grid; gap: 20px; }
        .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
        .grid-2 { grid-template-columns: 1fr 1fr; }
        .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
        @media (max-width: 768px) { .grid-3, .grid-4, .grid-2 { grid-template-columns: 1fr; } }
        table { width: 100%; border-collapse: collapse; font-family: Georgia, serif; }
        th { padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #8a6d3b; border-bottom: 2px solid #e0d8c8; background: #faf6ee; }
        td { padding: 12px 14px; border-bottom: 1px solid #f0e8d8; font-size: 13px; color: #1a1a1a; }
        .kpi-label { font-size: 11px; font-weight: 700; color: #8a6d3b; text-transform: uppercase; letter-spacing: 2px; }
        .kpi-value { font-family: Georgia, serif; font-size: 30px; font-weight: 700; color: #1a1a1a; margin-top: 6px; line-height: 1; }
        .kpi-sub { font-size: 12px; color: #8a8a8a; margin-top: 6px; }
        .pill { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
        @media print { body { background: #fff; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="wrap">
        <!-- Header with logo -->
        <header style="background:#ffffff;border:1px solid #e8e4dd;border-bottom:4px solid #A52D2D;border-radius:4px;padding:28px 32px;margin-bottom:32px;display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center">
            <div>
                <img src="${data.baseUrl || ''}/niat-logo.jpg" alt="NIAT" width="76" height="76" style="border-radius:8px;display:block" />
            </div>
            <div>
                <div style="font-size:11px;font-weight:700;color:#8a6d3b;text-transform:uppercase;letter-spacing:2.5px">Office of Fee Collection</div>
                <h1 style="margin-top:6px">Fee Collection Analytics</h1>
                <div style="font-size:14px;color:#666;margin-top:6px">${data.period.name} · ${totalStudents.toLocaleString()} students across ${(s.universities || 0)} universities</div>
            </div>
            <div class="no-print" style="text-align:right">
                <a href="javascript:window.print()" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-family:Georgia,serif;font-size:12px;font-weight:700;padding:10px 20px;border-radius:3px;letter-spacing:1px">PRINT / SAVE PDF</a>
            </div>
        </header>

        <!-- KPI cards -->
        <div class="grid grid-4" style="margin-bottom:32px">
            <div class="card">
                <div class="kpi-label">Total Payable</div>
                <div class="kpi-value">${fmt(s.total_payable)}</div>
                <div class="kpi-sub">${totalStudents} students</div>
            </div>
            <div class="card">
                <div class="kpi-label">Total Paid</div>
                <div class="kpi-value" style="color:#0f7a3f">${fmt(s.total_paid)}</div>
                <div class="kpi-sub">${fullyPct}% fully paid</div>
            </div>
            <div class="card">
                <div class="kpi-label">Pending</div>
                <div class="kpi-value" style="color:#A52D2D">${fmt(s.total_pending)}</div>
                <div class="kpi-sub">${n(s.not_paid)} not paid · ${n(s.partial_paid)} partial</div>
            </div>
            <div class="card">
                <div class="kpi-label">Collection Efficiency</div>
                <div class="kpi-value" style="color:${eff >= 95 ? '#0f7a3f' : eff >= 85 ? '#d4af37' : '#A52D2D'}">${eff.toFixed(1)}%</div>
                <div class="kpi-sub">across ${(s.universities || 0)} universities</div>
            </div>
        </div>

        <!-- Visual Rings -->
        <h2>Performance Rings</h2>
        <div class="card grid grid-3" style="text-align:center">
            <div>
                ${ringSVG(eff, 180, 18, '#A52D2D', 'Collection Eff.', eff.toFixed(0) + '%')}
                <div style="font-size:12px;color:#666;margin-top:8px">Of total payable, how much collected</div>
            </div>
            <div>
                ${ringSVG(fullyPct, 180, 18, '#0f7a3f', 'Fully Paid', fullyPct + '%')}
                <div style="font-size:12px;color:#666;margin-top:8px">${n(s.fully_paid)} students with zero pending</div>
            </div>
            <div>
                ${ringSVG(100 - fullyPct, 180, 18, '#d4af37', 'Open Cases', (100 - fullyPct) + '%')}
                <div style="font-size:12px;color:#666;margin-top:8px">${n(s.partial_paid) + n(s.not_paid)} students need follow-up</div>
            </div>
        </div>

        <!-- Per-university stacked bars -->
        <h2>Student Payment Status — Per University</h2>
        <div class="card">
            <h3>How many students fully paid / partially paid / not paid in each university</h3>
            ${stackedBarSVG(data.byUniv.map((u: any) => ({
                name: u.university_name,
                full: n(u.fully_paid),
                partial: n(u.partial_paid),
                nullc: n(u.not_paid),
            })))}
        </div>

        <!-- Pending amount per university -->
        <h2>Pending Amount — Per University</h2>
        <div class="card">
            <h3>Outstanding fees still to be collected</h3>
            ${barChartSVG(data.byUniv.map((u: any) => ({
                label: u.university_name,
                value: n(u.pending),
                max: n(u.pending),
                color: n(u.pending) > 5000000 ? '#A52D2D' : n(u.pending) > 1000000 ? '#d4af37' : '#0f7a3f',
            })))}
        </div>

        <!-- Top + Bottom 5 -->
        <h2>Top &amp; Bottom Performers</h2>
        <div class="grid grid-2">
            <div class="card">
                <h3 style="color:#0f7a3f">🏆 Top 5 — Highest Collection Efficiency</h3>
                <table>
                    <tr><th>Rank</th><th>University</th><th style="text-align:right">Efficiency</th><th style="text-align:right">Paid</th></tr>
                    ${top5.map((u: any, i: number) => `
                        <tr>
                            <td><strong>${i + 1}</strong></td>
                            <td>${u.university_name}</td>
                            <td style="text-align:right"><span class="pill" style="background:#dcf6e1;color:#0f7a3f">${Number(u.collection_efficiency).toFixed(1)}%</span></td>
                            <td style="text-align:right;color:#0f7a3f;font-weight:700">${fmt(u.paid)}</td>
                        </tr>`).join('')}
                </table>
            </div>
            <div class="card">
                <h3 style="color:#A52D2D">⚠️ Bottom 5 — Need Attention</h3>
                <table>
                    <tr><th>Rank</th><th>University</th><th style="text-align:right">Efficiency</th><th style="text-align:right">Pending</th></tr>
                    ${bottom5.map((u: any, i: number) => `
                        <tr>
                            <td><strong>${i + 1}</strong></td>
                            <td>${u.university_name}</td>
                            <td style="text-align:right"><span class="pill" style="background:#fde2e2;color:#A52D2D">${Number(u.collection_efficiency).toFixed(1)}%</span></td>
                            <td style="text-align:right;color:#A52D2D;font-weight:700">${fmt(u.pending)}</td>
                        </tr>`).join('')}
                </table>
            </div>
        </div>

        <!-- Case tag breakdown -->
        ${data.tagCounts.length ? `
        <h2>Case Tags Breakdown</h2>
        <div class="card">
            <h3>Students by tagged case type</h3>
            ${barChartSVG(data.tagCounts.map((t: any) => ({
                label: tagMap[t.tag]?.label || t.tag,
                value: t.count,
                max: t.count,
                color: tagMap[t.tag]?.color || '#666',
            })), 200)}
        </div>` : ''}

        <!-- Full university table -->
        <h2>All Universities — Detailed Breakdown</h2>
        <div class="card" style="padding:0;overflow-x:auto">
            <table>
                <thead>
                    <tr>
                        <th>University</th>
                        <th style="text-align:right">Strength</th>
                        <th style="text-align:right">Full</th>
                        <th style="text-align:right">Partial</th>
                        <th style="text-align:right">Not Paid</th>
                        <th style="text-align:right">Payable</th>
                        <th style="text-align:right">Paid</th>
                        <th style="text-align:right">Pending</th>
                        <th style="text-align:right">Eff %</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.byUniv.map((u: any) => `
                    <tr>
                        <td><strong>${u.university_name}</strong></td>
                        <td style="text-align:right">${n(u.strength)}</td>
                        <td style="text-align:right;color:#0f7a3f"><strong>${n(u.fully_paid)}</strong></td>
                        <td style="text-align:right;color:#d4af37">${n(u.partial_paid)}</td>
                        <td style="text-align:right;color:#A52D2D">${n(u.not_paid)}</td>
                        <td style="text-align:right">${fmt(u.payable)}</td>
                        <td style="text-align:right;color:#0f7a3f">${fmt(u.paid)}</td>
                        <td style="text-align:right;color:#A52D2D">${fmt(u.pending)}</td>
                        <td style="text-align:right"><span class="pill" style="background:${Number(u.collection_efficiency) >= 95 ? '#dcf6e1' : Number(u.collection_efficiency) >= 85 ? '#fef3c7' : '#fde2e2'};color:${Number(u.collection_efficiency) >= 95 ? '#0f7a3f' : Number(u.collection_efficiency) >= 85 ? '#8a6d3b' : '#A52D2D'}">${Number(u.collection_efficiency).toFixed(1)}%</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>

        <footer style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #e8e4dd;font-size:12px;color:#8a8a8a">
            <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#A52D2D">NXTWAVE · Institute of Advanced Technologies</div>
            <div style="margin-top:6px">Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · UniConnect Fee Collection</div>
        </footer>
    </div>
</body>
</html>`;
}
