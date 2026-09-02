import type { PettyCashRequest, PettyCashStatus } from '@uniconnect/shared';

/**
 * Branded, self-contained HTML email for petty-cash lifecycle updates.
 * Sent with `wrap: false` so this markup is the whole email body.
 * Table-based + inline styles for broad email-client compatibility.
 */

const money = (n: any) => '₹' + Number(n || 0).toLocaleString('en-IN');
const fdate = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATE: Record<string, { grad: string; solid: string; label: string; stage: number; emoji: string }> = {
    SUBMITTED:     { grad: 'linear-gradient(135deg,#D97706,#F59E0B)', solid: '#D97706', label: 'Awaiting Level-1', stage: 1, emoji: '🔔' },
    L1_APPROVED:   { grad: 'linear-gradient(135deg,#CA8A04,#EAB308)', solid: '#CA8A04', label: 'Awaiting Final Approval', stage: 1, emoji: '🔔' },
    APPROVED:      { grad: 'linear-gradient(135deg,#0D9488,#14B8A6)', solid: '#0D9488', label: 'Approved',          stage: 2, emoji: '✅' },
    SENT_BACK:     { grad: 'linear-gradient(135deg,#EA580C,#F97316)', solid: '#EA580C', label: 'Sent Back',         stage: 0, emoji: '🔄' },
    DISBURSED:     { grad: 'linear-gradient(135deg,#4F46E5,#6366F1)', solid: '#4F46E5', label: 'Money Disbursed',   stage: 3, emoji: '💸' },
    BILL_VERIFIED: { grad: 'linear-gradient(135deg,#0891B2,#06B6D4)', solid: '#0891B2', label: 'Bill Verified',     stage: 4, emoji: '✅' },
    SETTLED:       { grad: 'linear-gradient(135deg,#059669,#10B981)', solid: '#059669', label: 'Settled',           stage: 5, emoji: '✔️' },
    CLOSED:        { grad: 'linear-gradient(135deg,#059669,#10B981)', solid: '#059669', label: 'Settled',           stage: 5, emoji: '✔️' },
    REJECTED:      { grad: 'linear-gradient(135deg,#DC2626,#EF4444)', solid: '#DC2626', label: 'Rejected',          stage: -1, emoji: '❌' },
};

const TRACK = ['Raised', 'Approved', 'Paid', 'Bill', 'Settled'];

function tracker(stage: number, solid: string): string {
    if (stage < 0) return '';
    const cells = TRACK.map((lbl, i) => {
        const done = i < stage;
        const active = i === stage;
        const bg = done ? solid : active ? solid : '#E5E7EB';
        const txt = done ? '#fff' : active ? '#fff' : '#9CA3AF';
        const dot = `<div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:${bg};color:${txt};font-size:11px;font-weight:700;text-align:center;margin:0 auto;">${done ? '✓' : i + 1}</div>`;
        const lblColor = active ? solid : '#9CA3AF';
        return `<td align="center" style="padding:0 2px;">
            ${dot}
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${lblColor};margin-top:6px;">${lbl}</div>
        </td>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr>${cells}</tr></table>`;
}

export function buildPettyCashEmail(o: {
    recipientName?: string;
    title: string;
    message: string;
    req: PettyCashRequest;
    toStatus: PettyCashStatus;
    ctaUrl: string;
    ctaLabel?: string;
}): string {
    const s = STATE[o.toStatus] || STATE.SUBMITTED;
    const r = o.req;
    const amount = money(r.amount_approved ?? r.amount_requested);

    const rows = [
        ['Purpose', r.purpose],
        ['Amount', amount],
        ['Category', r.category],
        ['University', r.university_name || ''],
        ['Requested by', r.requester_name || r.requester_email],
    ];
    if (['DISBURSED'].includes(o.toStatus) && r.bill_due_on) rows.push(['Bill due by', fdate(r.bill_due_on)]);

    const detailRows = rows.map(([k, v]) => `
        <tr>
            <td style="padding:9px 0;border-bottom:1px solid #F1F5F9;font-size:12px;color:#6B7280;font-weight:600;width:38%;">${k}</td>
            <td style="padding:9px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#111827;font-weight:600;">${v}</td>
        </tr>`).join('');

    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

    <!-- Header -->
    <tr><td style="background:${s.grad};border-radius:16px 16px 0 0;padding:26px 30px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.75);">UniConnect · Petty Cash</div>
        <div style="font-size:22px;font-weight:700;color:#fff;margin-top:8px;line-height:1.25;">${s.emoji} ${o.title}</div>
        <div style="margin-top:12px;">
            <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:20px;">${s.label}</span>
            <span style="display:inline-block;color:rgba(255,255,255,0.85);font-size:12px;font-weight:600;margin-left:8px;font-family:monospace;">${r.request_no || ''}</span>
        </div>
    </td></tr>

    <!-- Body -->
    <tr><td style="background:#fff;padding:26px 30px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
        <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6;">Hi ${o.recipientName || 'there'},</p>
        <p style="margin:0;font-size:15px;color:#111827;line-height:1.6;font-weight:500;">${o.message}</p>

        ${tracker(s.stage, s.solid)}

        <div style="margin:22px 0 0;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF;margin-bottom:6px;">Request Details</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>
        </div>

        <div style="margin:26px 0 4px;">
            <a href="${o.ctaUrl}" style="display:inline-block;background:${s.solid};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.02em;">${o.ctaLabel || 'Open in UniConnect'} →</a>
        </div>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#F9FAFB;border-radius:0 0 16px 16px;border:1px solid #E5E7EB;border-top:none;padding:16px 30px;">
        <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.5;">UniConnect · NIAT Budget &amp; Finance Ops · This is an automated message. If it wasn't meant for you, you can ignore it.</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}
