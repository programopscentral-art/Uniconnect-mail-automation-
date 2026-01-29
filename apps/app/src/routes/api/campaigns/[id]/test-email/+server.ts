import { getCampaignById, getStudents, getTemplateById, getMailboxCredentials, decryptString, TemplateRenderer } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { google } from 'googleapis';
import { env } from '$env/dynamic/private';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const { testEmail } = await request.json().catch(() => ({}));
    if (!testEmail) throw error(400, 'Test email address required');

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    try {
        console.log(`[TEST_EMAIL] Starting test for campaign ${campaignId} to ${testEmail}`);

        // Populate process.env for shared package crypto
        process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

        // 1. Get template
        const template = await getTemplateById(campaign.template_id);
        if (!template) {
            return json({ success: false, message: 'Template not found' }, { status: 400 });
        }

        // 2. Get sample student for variables
        const students = await getStudents(campaign.university_id, 1);
        if (students.length === 0) {
            return json({ success: false, message: 'No students found in university to use as sample data' }, { status: 400 });
        }
        const sampleStudent = students[0];

        // 3. Get mailbox credentials
        const mailbox = await getMailboxCredentials(campaign.mailbox_id);
        if (!mailbox) {
            return json({ success: false, message: 'Mailbox not found' }, { status: 400 });
        }

        if (!mailbox.refresh_token_enc) {
            return json({ success: false, message: 'Mailbox not authenticated' }, { status: 400 });
        }

        console.log(`[TEST_EMAIL] Decrypting refresh token for mailbox ${mailbox.email}`);
        const refreshToken = decryptString(mailbox.refresh_token_enc);
        if (!refreshToken) {
            return json({ success: false, message: 'Failed to decrypt mailbox credentials' }, { status: 500 });
        }

        // 4. Setup OAuth2
        const oauth2Client = new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        console.log(`[TEST_EMAIL] Getting access token...`);
        const { token } = await oauth2Client.getAccessToken();
        if (!token) {
            return json({ success: false, message: 'Failed to get access token from Google' }, { status: 500 });
        }

        // 5. Prepare variables
        let metaObj = sampleStudent.metadata || {};
        if (typeof metaObj === 'string') {
            try { metaObj = JSON.parse(metaObj); } catch (e) { metaObj = {}; }
        }

        const variables = {
            studentName: sampleStudent.name,
            STUDENT_NAME: sampleStudent.name,
            name: sampleStudent.name,
            studentExternalId: sampleStudent.external_id,
            metadata: metaObj,
            ...metaObj,
            // Add helpful fallbacks for test emails
            'TERM_FEE': metaObj['TERM_FEE'] || metaObj['Fee Amount'] || metaObj['2nd Sem Fee'] || '150,000',
            'Payment link': metaObj['Payment link'] || metaObj['pay_link'] || metaObj['PAY_LINK'] || template.config?.payButton?.url || ''
        };

        // 6. Render template
        console.log(`[TEST_EMAIL] Rendering template...`);
        const trackingToken = 'test_' + crypto.randomBytes(8).toString('hex');

        const subject = TemplateRenderer.render(template.subject, variables, {
            config: template.config,
            noLayout: true
        }).replace(/<[^>]*>/g, '').trim();

        const htmlBody = TemplateRenderer.render(template.html, variables, {
            includeAck: campaign.include_ack,
            trackingToken: trackingToken,
            baseUrl: env.PUBLIC_BASE_URL,
            config: template.config
        });

        // 7. Send via Gmail API
        console.log(`[TEST_EMAIL] Sending to ${testEmail} via Gmail API...`);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `MIME-Version: 1.0`,
            `To: ${testEmail}`,
            `From: "NIAT Support" <${mailbox.email}>`,
            `Subject: [TEST] ${utf8Subject}`,
            `X-UniConnect-Token: ${trackingToken}`,
            `Content-Type: text/html; charset=utf-8`,
            `Content-Transfer-Encoding: base64`,
            '',
            Buffer.from(htmlBody).toString('base64')
        ];

        const rawMessage = messageParts.join('\r\n');
        const encodedMail = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMail
            }
        });

        console.log(`[TEST_EMAIL] ✅ Email sent successfully! Message ID: ${res.data.id}`);
        return json({ success: true, message: `Test email sent to ${testEmail}`, messageId: res.data.id });
    } catch (err: any) {
        console.error(`[TEST_EMAIL] ❌ Failed for campaign ${campaignId}:`, err);

        let message = err.message || 'Internal server error while sending test email';
        if (message.includes('invalid_grant') || message.includes('401')) {
            message = 'Gmail authentication expired. Please re-connect the mailbox.';
        }

        return json({
            success: false,
            message
        }, { status: 500 });
    }
};
