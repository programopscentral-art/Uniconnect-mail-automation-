import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    findStudentsWithoutDocs,
    createDocRequests,
    getDocRequests,
    getDocRequestStats,
    getFeeStudentById,
} from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import { addNotificationJob } from '$lib/server/queue';

export const GET: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'view');
    const periodId = url.searchParams.get('period_id');
    if (!periodId) throw error(400, 'period_id required');

    if (url.searchParams.get('view') === 'missing') {
        const rows = await findStudentsWithoutDocs(periodId, {
            university_id: url.searchParams.get('university_id') || undefined,
            only_unpaid: url.searchParams.get('only_unpaid') === 'true',
        });
        return json(rows);
    }

    if (url.searchParams.get('view') === 'stats') {
        const stats = await getDocRequestStats(periodId);
        return json(stats);
    }

    const rows = await getDocRequests(periodId, {
        status: url.searchParams.get('status') || undefined,
        batch_send_id: url.searchParams.get('batch') || undefined,
    });
    return json(rows);
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
    checkFeeAccess(locals, 'edit_remarks');
    const body = await request.json();

    if (!body.period_id || !Array.isArray(body.student_payment_ids) || !body.student_payment_ids.length) {
        throw error(400, 'period_id and student_payment_ids required');
    }
    if (!body.message || !body.email_subject) {
        throw error(400, 'message and email_subject required');
    }

    const result = await createDocRequests({
        period_id: body.period_id,
        student_payment_ids: body.student_payment_ids,
        doc_type: body.doc_type || 'billing_receipt',
        message: body.message,
        upload_form_url: body.upload_form_url,
        email_subject: body.email_subject,
        sent_by: locals.user!.id,
    });

    // Send emails in background (don't block response)
    const origin = new URL(url).origin;
    Promise.all(result.requests.map(async (req) => {
        try {
            const stu = await getFeeStudentById(req.student_payment_id);
            if (!stu) return;
            // Try email from student's external_id mapping or skip
            const studentEmail = body.email_to_override || stu.email || null;
            if (!studentEmail) return; // can't send without email

            const ackUrl = `${origin}/fee-ack/${req.ack_token}`;
            const uploadUrl = body.upload_form_url || ackUrl;

            const html = buildDocRequestEmail({
                studentName: stu.student_name || 'Student',
                universityName: stu.university_name || '',
                pending: Number(stu.pending) || 0,
                payable: Number(stu.payable) || 0,
                paid: Number(stu.paid) || 0,
                message: body.message,
                ackUrl,
                uploadUrl,
            });

            await addNotificationJob({
                to: studentEmail,
                subject: body.email_subject,
                text: `${body.message}\n\nUpload your documents: ${uploadUrl}\nAcknowledge receipt: ${ackUrl}`,
                html,
            });
        } catch (e: any) {
            console.error('[FEE_DOC_REQUEST] Email send error:', e.message);
        }
    })).catch((e) => console.error('[FEE_DOC_REQUEST] Batch send error:', e.message));

    return json(result);
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
    const logoUrl = (opts.baseUrl || 'https://uniconnect-app.up.railway.app') + '/niat-logo.svg';
    const completionPct = opts.payable > 0 ? Math.round((opts.paid / opts.payable) * 100) : 0;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIAT — Fee Documents</title></head>
<body style="margin:0;padding:0;background:#f6f5f3;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;padding:32px 12px">
    <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e8e4dd;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(165,45,45,0.08)">

            <!-- Header with logo strip -->
            <tr><td style="background:#ffffff;padding:24px 32px;border-bottom:3px solid #A52D2D;text-align:center">
                <img src="${logoUrl}" alt="NIAT" width="56" height="68" style="display:inline-block;margin:0 auto" />
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#A52D2D;margin-top:8px;letter-spacing:1px">NXTWAVE INSTITUTE OF ADVANCED TECHNOLOGIES</div>
                <div style="font-size:11px;color:#8a8a8a;margin-top:2px;letter-spacing:2px;text-transform:uppercase">Office of Fee Collection</div>
            </td></tr>

            <!-- Salutation + reference -->
            <tr><td style="padding:24px 32px 12px">
                <table width="100%">
                    <tr>
                        <td style="font-size:13px;color:#666"><strong style="color:#1a1a1a">Reference:</strong> Term 2 Fee Documentation</td>
                        <td style="font-size:13px;color:#666;text-align:right"><strong style="color:#1a1a1a">Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    </tr>
                </table>
            </td></tr>

            <!-- Subject line -->
            <tr><td style="padding:0 32px 16px">
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#A52D2D;letter-spacing:-0.3px">Action Required: Submit Your Fee Receipts</h1>
                <div style="height:2px;width:60px;background:#A52D2D;margin-top:8px"></div>
            </td></tr>

            <!-- Body -->
            <tr><td style="padding:8px 32px 20px">
                <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;color:#1a1a1a;line-height:1.7">Dear <strong>${opts.studentName}</strong>,</p>
                <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:14px;color:#333;line-height:1.75;white-space:pre-wrap">${opts.message}</p>
            </td></tr>

            <!-- Fee status card — elegant table -->
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
                        <!-- Progress bar -->
                        <div style="margin-top:14px;background:#f0e8d8;height:6px;border-radius:3px;overflow:hidden">
                            <div style="background:#0f7a3f;height:100%;width:${completionPct}%"></div>
                        </div>
                        <div style="font-family:Georgia,serif;font-size:11px;color:#8a8a8a;text-align:right;margin-top:4px">${completionPct}% completed</div>
                    </td></tr>
                </table>
            </td></tr>

            <!-- Primary CTA: Upload -->
            <tr><td style="padding:0 32px 6px;text-align:center">
                <a href="${opts.uploadUrl}" style="display:inline-block;background:#A52D2D;color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:14px;font-weight:700;padding:14px 36px;border-radius:3px;letter-spacing:1px;border:2px solid #A52D2D">
                    UPLOAD YOUR DOCUMENTS
                </a>
            </td></tr>

            <!-- Secondary CTA: Acknowledge -->
            <tr><td style="padding:8px 32px 24px;text-align:center">
                <a href="${opts.ackUrl}" style="display:inline-block;background:#ffffff;color:#A52D2D;text-decoration:none;font-family:Georgia,serif;font-size:12px;font-weight:700;padding:10px 24px;border-radius:3px;letter-spacing:1px;border:1px solid #A52D2D">
                    ✓ I ACKNOWLEDGE RECEIPT OF THIS NOTICE
                </a>
            </td></tr>

            <!-- Disclaimer -->
            <tr><td style="padding:0 32px 24px">
                <div style="border-top:1px solid #e8e4dd;padding-top:14px">
                    <p style="margin:0;font-family:Georgia,serif;font-size:11px;color:#8a8a8a;line-height:1.6;font-style:italic">
                        Please upload your documents at the earliest. Clicking "Acknowledge" confirms you have received this notice. For queries, contact your university coordinator or the Fee Collection office. Your prompt response will help us close your file efficiently.
                    </p>
                </div>
            </td></tr>

            <!-- Signature block -->
            <tr><td style="padding:0 32px 28px">
                <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#1a1a1a;line-height:1.7">
                    Regards,<br/>
                    <strong>Office of Fee Collection</strong><br/>
                    NxtWave Institute of Advanced Technologies<br/>
                    <span style="color:#8a8a8a;font-size:12px">${opts.universityName}</span>
                </p>
            </td></tr>

            <!-- Footer -->
            <tr><td style="padding:18px 32px;background:#1a1a1a;color:#ffffff;text-align:center">
                <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d4af37">NxtWave · Institute of Advanced Technologies</div>
                <div style="font-family:Georgia,serif;font-size:10px;color:#888;margin-top:4px">This is an automated notice from UniConnect Fee Collection · Do not reply to this email</div>
            </td></tr>

        </table>
    </td></tr>
</table>
</body></html>`;
}
