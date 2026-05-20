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
</body></html>`;
}
