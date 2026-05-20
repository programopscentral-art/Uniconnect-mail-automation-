import type { RequestHandler } from './$types';
import { checkFeeAccess } from '$lib/server/fee_access';

/**
 * Preview the doc-request email template. Renders HTML in browser
 * so admins can see exactly what students will receive.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
    checkFeeAccess(locals, 'view');

    const baseUrl = new URL(url).origin;
    const html = buildDocRequestEmail({
        studentName: 'Aditya Sharma',
        universityName: 'AMET',
        pending: 75000,
        payable: 175000,
        paid: 100000,
        message: 'We noticed that your billing receipts for Term 2 have not yet been received by our office. To complete your fee documentation, please upload the relevant receipts using the link below and acknowledge this notice.\n\nIf you have already made the payment, kindly share the proof of payment so that we can update our records accordingly. Your prompt action will help us close your file efficiently and ensure uninterrupted academic progression.',
        ackUrl: `${baseUrl}/fee-ack/PREVIEW_TOKEN`,
        uploadUrl: 'https://forms.google.com/your-upload-form',
        baseUrl,
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
    baseUrl?: string;
}): string {
    const fmt = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
    const logoUrl = (opts.baseUrl || 'https://uniconnect-app.up.railway.app') + '/niat-logo.jpg';
    const completionPct = opts.payable > 0 ? Math.round((opts.paid / opts.payable) * 100) : 0;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIAT — Fee Documents</title></head>
<body style="margin:0;padding:0;background:#f6f5f3;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
<div style="max-width:600px;margin:20px auto 0;padding:10px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;font-size:11px;color:#92400e;text-align:center;font-family:Georgia,serif">
    👀 PREVIEW — sample data. Real emails are sent from the "Doc Requests" tab.
</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;padding:24px 12px 32px">
    <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e8e4dd;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(165,45,45,0.08)">
            <tr><td style="background:#ffffff;padding:24px 32px;border-bottom:3px solid #A52D2D;text-align:center">
                <img src="${logoUrl}" alt="NIAT" width="68" height="68" style="display:inline-block;border-radius:6px" />
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#A52D2D;margin-top:8px;letter-spacing:1px">NXTWAVE INSTITUTE OF ADVANCED TECHNOLOGIES</div>
                <div style="font-size:11px;color:#8a8a8a;margin-top:2px;letter-spacing:2px;text-transform:uppercase">Office of Fee Collection</div>
            </td></tr>
            <tr><td style="padding:24px 32px 12px">
                <table width="100%">
                    <tr>
                        <td style="font-size:13px;color:#666"><strong style="color:#1a1a1a">Reference:</strong> Term 2 Fee Documentation</td>
                        <td style="font-size:13px;color:#666;text-align:right"><strong style="color:#1a1a1a">Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    </tr>
                </table>
            </td></tr>
            <tr><td style="padding:0 32px 16px">
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#A52D2D;letter-spacing:-0.3px">Action Required: Submit Your Fee Receipts</h1>
                <div style="height:2px;width:60px;background:#A52D2D;margin-top:8px"></div>
            </td></tr>
            <tr><td style="padding:8px 32px 20px">
                <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;color:#1a1a1a;line-height:1.7">Dear <strong>${opts.studentName}</strong>,</p>
                <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:14px;color:#333;line-height:1.75;white-space:pre-wrap">${opts.message}</p>
            </td></tr>
            <tr><td style="padding:0 32px 20px">
                <table width="100%" style="border:1px solid #e0d8c8;border-radius:4px;overflow:hidden">
                    <tr><td style="background:#faf6ee;padding:10px 16px;border-bottom:1px solid #e0d8c8">
                        <div style="font-family:Georgia,serif;font-size:11px;font-weight:700;color:#8a6d3b;text-transform:uppercase;letter-spacing:2px">Your Fee Status — Term 2</div>
                    </td></tr>
                    <tr><td style="padding:18px 16px">
                        <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                                <td width="33%" style="text-align:center;padding:0 8px;border-right:1px solid #e0d8c8">
                                    <div style="font-family:Georgia,serif;font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1.5px">Payable</div>
                                    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1a1a1a;margin-top:4px">${fmt(opts.payable)}</div>
                                </td>
                                <td width="34%" style="text-align:center;padding:0 8px;border-right:1px solid #e0d8c8">
                                    <div style="font-family:Georgia,serif;font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1.5px">Paid</div>
                                    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#0f7a3f;margin-top:4px">${fmt(opts.paid)}</div>
                                </td>
                                <td width="33%" style="text-align:center;padding:0 8px">
                                    <div style="font-family:Georgia,serif;font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1.5px">Pending</div>
                                    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#A52D2D;margin-top:4px">${fmt(opts.pending)}</div>
                                </td>
                            </tr>
                        </table>
                        <div style="margin-top:14px;background:#f0e8d8;height:6px;border-radius:3px;overflow:hidden">
                            <div style="background:#0f7a3f;height:100%;width:${completionPct}%"></div>
                        </div>
                        <div style="font-family:Georgia,serif;font-size:11px;color:#8a8a8a;text-align:right;margin-top:4px">${completionPct}% completed</div>
                    </td></tr>
                </table>
            </td></tr>
            <tr><td style="padding:0 32px 6px;text-align:center">
                <a href="${opts.uploadUrl}" style="display:inline-block;background:#A52D2D;color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:14px;font-weight:700;padding:14px 36px;border-radius:3px;letter-spacing:1px;border:2px solid #A52D2D">UPLOAD YOUR DOCUMENTS</a>
            </td></tr>
            <tr><td style="padding:8px 32px 24px;text-align:center">
                <a href="${opts.ackUrl}" style="display:inline-block;background:#ffffff;color:#A52D2D;text-decoration:none;font-family:Georgia,serif;font-size:12px;font-weight:700;padding:10px 24px;border-radius:3px;letter-spacing:1px;border:1px solid #A52D2D">✓ I ACKNOWLEDGE RECEIPT OF THIS NOTICE</a>
            </td></tr>
            <tr><td style="padding:0 32px 24px">
                <div style="border-top:1px solid #e8e4dd;padding-top:14px">
                    <p style="margin:0;font-family:Georgia,serif;font-size:11px;color:#8a8a8a;line-height:1.6;font-style:italic">
                        Please upload your documents at the earliest. Clicking "Acknowledge" confirms you have received this notice. For queries, contact your university coordinator or the Fee Collection office. Your prompt response will help us close your file efficiently.
                    </p>
                </div>
            </td></tr>
            <tr><td style="padding:0 32px 28px">
                <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#1a1a1a;line-height:1.7">
                    Regards,<br/>
                    <strong>Office of Fee Collection</strong><br/>
                    NxtWave Institute of Advanced Technologies<br/>
                    <span style="color:#8a8a8a;font-size:12px">${opts.universityName}</span>
                </p>
            </td></tr>
            <tr><td style="padding:18px 32px;background:#1a1a1a;color:#ffffff;text-align:center">
                <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d4af37">NxtWave · Institute of Advanced Technologies</div>
                <div style="font-family:Georgia,serif;font-size:10px;color:#888;margin-top:4px">This is an automated notice from UniConnect Fee Collection · Do not reply to this email</div>
            </td></tr>
        </table>
    </td></tr>
</table>
</body></html>`;
}
