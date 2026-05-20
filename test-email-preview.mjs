/**
 * Preview the two email templates for L1 approval notification.
 * Run: node test-email-preview.mjs
 * Opens two HTML files in browser.
 */
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Simulate proposal data
const proposalUnder10K = {
    id: 'test-under-10k',
    title: 'STARTUP STIMULATOR',
    status: 'APPROVED_L1',
    proposer_name: 'Cr Bhargava',
    proposer_email: 'cr.bhargava@nxtwave.co.in',
    proposer_user_id: 'test',
    university_id: 'test',
    university_name: 'ACADEMY',
    estimated_total_budget: 2000,
    approved_total_budget: 2000,
    priority: 'MED',
    proposed_date: '2026-04-25',
    venue: 'Academy Campus',
    description: 'Startup competition with prizes for top 3 winners. Expected 100 participants.',
    items: [
        { category: 'AWARDS', description: 'Prize money / award for first prize winner', qty: 1, unit_cost: 1000, amount: 1000 },
        { category: 'AWARDS', description: 'Prize money / award for 2nd and 3rd prize winner', qty: 2, unit_cost: 500, amount: 1000 }
    ]
};

const proposalOver10K = {
    id: 'test-over-10k',
    title: 'Annual Sports Day - CDU Campus',
    status: 'APPROVED_L1',
    proposer_name: 'Shanthan Singam',
    proposer_email: 'shanthan@nxtwave.co.in',
    proposer_user_id: 'test',
    university_id: 'test',
    university_name: 'CDU',
    estimated_total_budget: 45000,
    approved_total_budget: 45000,
    priority: 'HIGH',
    proposed_date: '2026-05-10',
    venue: 'CDU Sports Ground',
    description: 'Annual sports event with T-shirts, trophies, banners, and refreshments for 500 students.',
    items: [
        { category: 'MARKETING', description: '200 T-shirts (Cotton 180 GSM, custom print)', qty: 200, unit_cost: 150, amount: 30000 },
        { category: 'AWARDS', description: 'Trophies (Gold/Silver/Bronze)', qty: 15, unit_cost: 500, amount: 7500 },
        { category: 'MARKETING', description: 'Stage banner (20ft x 8ft)', qty: 2, unit_cost: 2000, amount: 4000 },
        { category: 'MISC', description: 'Refreshments & water bottles', qty: 500, unit_cost: 7, amount: 3500 }
    ]
};

function fmtINR(n) {
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
}

function buildEmail(proposal, isUnder10K) {
    const budget = Number(proposal.estimated_total_budget);
    const actorName = 'Pravalika (CMA Manager)';

    const titleText = isUnder10K
        ? `Budget Proposal Approved — ${fmtINR(budget)} ✅`
        : `CMA Approved, Admin Approval Needed 🔔`;

    const bodyText = isUnder10K
        ? `${actorName} has approved "${proposal.title}" for ${proposal.university_name} (${fmtINR(budget)}). This proposal is under ₹10,000 so CMA approval is sufficient. Procurement can proceed.\n\nProposed by: ${proposal.proposer_name} (${proposal.proposer_email})\n\nThis is for your information. No action needed — click OK to acknowledge.`
        : `${actorName} has given CMA approval for "${proposal.title}" (${fmtINR(budget)}). Admin approval is required as budget is ≥₹10,000.`;

    const itemRows = proposal.items.map(i => `
        <tr>
            <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;">${i.category}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;">${i.description}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;text-align:center;">${i.qty}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;text-align:right;">${fmtINR(i.unit_cost)}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;text-align:right;">${fmtINR(i.amount)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
<tr><td align="center">
<table width="600" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <!-- Header -->
    <tr><td style="background:linear-gradient(135deg,${isUnder10K ? '#059669' : '#D97706'} 0%,${isUnder10K ? '#10B981' : '#F59E0B'} 100%);padding:28px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:800;color:#FFFFFF;">${titleText}</h1>
        <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">UniConnect Budget Proposal Notification</p>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:28px 32px;">
        <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 20px;white-space:pre-line;">${bodyText}</p>

        <!-- Proposal Summary -->
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:20px;">
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Event</td>
                    <td style="padding:4px 0;font-size:14px;color:#111827;font-weight:700;">${proposal.title}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">University</td>
                    <td style="padding:4px 0;font-size:14px;color:#111827;font-weight:600;">${proposal.university_name}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">Proposed by</td>
                    <td style="padding:4px 0;font-size:14px;color:#111827;">${proposal.proposer_name} (${proposal.proposer_email})</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">Date</td>
                    <td style="padding:4px 0;font-size:14px;color:#111827;">${new Date(proposal.proposed_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">Budget</td>
                    <td style="padding:4px 0;font-size:18px;color:${isUnder10K ? '#059669' : '#D97706'};font-weight:800;">${fmtINR(budget)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">Priority</td>
                    <td style="padding:4px 0;"><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:${proposal.priority === 'HIGH' ? '#FEE2E2' : '#F3F4F6'};color:${proposal.priority === 'HIGH' ? '#DC2626' : '#6B7280'};text-transform:uppercase;">${proposal.priority}</span></td>
                </tr>
            </table>
        </div>

        ${proposal.description ? `<div style="margin-bottom:20px;padding:14px 18px;background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:8px;"><p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.6;"><strong>Description:</strong> ${proposal.description}</p></div>` : ''}

        <!-- Items Table -->
        <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">💰 Budget Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#F8FAFC;">
                <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:left;">Category</th>
                <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:left;">Description</th>
                <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:center;">Qty</th>
                <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:right;">Unit Cost</th>
                <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:right;">Amount</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot><tr style="background:#F9FAFB;">
                <td colspan="4" style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#374151;">Total</td>
                <td style="padding:10px 12px;font-size:15px;font-weight:800;text-align:right;color:#111827;">${fmtINR(budget)}</td>
            </tr></tfoot>
        </table>

        <!-- CTA Button -->
        <div style="text-align:center;margin-top:28px;">
            ${isUnder10K
                ? `<a href="#" style="display:inline-block;padding:14px 36px;background:#059669;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;letter-spacing:0.5px;">✓ OK, Acknowledged</a>
                   <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">No action required — this is for your information only.</p>`
                : `<a href="#" style="display:inline-block;padding:14px 36px;background:#D97706;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;letter-spacing:0.5px;">Review & Approve →</a>
                   <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">Admin approval required for budgets ≥₹10,000</p>`
            }
        </div>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:18px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
        <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">UniConnect · Budget Proposal System · ${new Date().toLocaleDateString('en-IN')}</p>
    </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Generate both
const html1 = buildEmail(proposalUnder10K, true);
const html2 = buildEmail(proposalOver10K, false);

writeFileSync('/tmp/email_under_10k.html', html1);
writeFileSync('/tmp/email_over_10k.html', html2);

console.log('✓ Generated: /tmp/email_under_10k.html (₹2,000 — informational)');
console.log('✓ Generated: /tmp/email_over_10k.html (₹45,000 — needs approval)');

// Open in browser
try {
    execSync('open /tmp/email_under_10k.html');
    execSync('open /tmp/email_over_10k.html');
    console.log('✓ Opened both in browser');
} catch {
    console.log('Open the HTML files manually in your browser');
}
