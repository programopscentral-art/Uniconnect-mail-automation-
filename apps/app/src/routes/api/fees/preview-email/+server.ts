import type { RequestHandler } from './$types';
import { checkFeeAccess } from '$lib/server/fee_access';

/**
 * Preview the doc-request email template. Renders HTML in browser
 * so admins can see exactly what students will receive.
 */
export const GET: RequestHandler = async ({ locals }) => {
    checkFeeAccess(locals, 'view');

    const html = buildDocRequestEmail({
        studentName: 'Aditya Sharma',
        universityName: 'AMET',
        pending: 75000,
        payable: 175000,
        paid: 100000,
        message: 'Dear Aditya,\n\nWe noticed your billing receipts for Term 2 have not been uploaded yet. Please upload them using the link below and acknowledge this notice.\n\nIf you have already paid, please share the proof of payment so we can update our records.\n\nThank you,\nNxtWave Operations Team',
        ackUrl: 'https://uniconnect-app.up.railway.app/fee-ack/PREVIEW_TOKEN',
        uploadUrl: 'https://forms.google.com/your-upload-form',
    });

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};

function buildDocRequestEmail(opts: {
    studentName: string;
    universityName: string;
    pending: number;
    payable: number;
    paid: number;
    message: string;
    ackUrl: string;
    uploadUrl: string;
}): string {
    const fmt = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.08)">
            <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:28px 28px;color:#fff">
                <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:1.5px">UniConnect · Fee Documents</div>
                <div style="font-size:22px;font-weight:800;margin-top:6px">Action Required: Submit Your Receipts</div>
            </td></tr>
            <tr><td style="padding:28px">
                <p style="margin:0 0 14px;font-size:14px;color:#334155;line-height:1.6">Dear <strong>${opts.studentName}</strong>,</p>
                <p style="margin:0 0 18px;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">${opts.message}</p>
                <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px;margin:0 0 22px">
                    <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.7px">Your Fee Status</div>
                    <table width="100%" style="margin-top:8px"><tr>
                        <td style="font-size:13px;color:#78350f"><strong>Payable:</strong> ${fmt(opts.payable)}</td>
                        <td style="font-size:13px;color:#78350f"><strong>Paid:</strong> ${fmt(opts.paid)}</td>
                        <td style="font-size:13px;color:#78350f"><strong>Pending:</strong> ${fmt(opts.pending)}</td>
                    </tr></table>
                </div>
                <div style="text-align:center;margin:24px 0">
                    <a href="${opts.uploadUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px">📎 Upload Your Documents</a>
                </div>
                <div style="text-align:center;margin:14px 0">
                    <a href="${opts.ackUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 22px;border-radius:8px">✓ I Acknowledge This Message</a>
                </div>
                <p style="margin:18px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">
                    Clicking "Acknowledge" lets us know you've received this. Please upload your documents at your earliest convenience.<br>
                    For questions, contact your university coordinator.
                </p>
            </td></tr>
            <tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8">
                ${opts.universityName} · UniConnect Fee Collection
            </td></tr>
        </table>
    </td></tr>
</table>
<div style="max-width:600px;margin:20px auto;padding:14px 18px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;font-size:11px;color:#92400e;text-align:center">
    👀 This is a <strong>preview</strong> with sample data. Real emails are sent from the "Doc Requests" tab.
</div>
</body></html>`;
}
