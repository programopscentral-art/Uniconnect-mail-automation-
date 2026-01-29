import { db, getTemplateById, getMailboxCredentials, decryptString, TemplateRenderer } from '@uniconnect/shared';
import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

export async function sendToRecipient(
    campaignId: string,
    recipientId: string,
    gmailInstance?: any
): Promise<SendResult> {
    try {
        // 1. Fetch Fresh Data
        const [campaignArr, recipientArr] = await Promise.all([
            db.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]),
            db.query('SELECT r.*, s.name as student_name, s.external_id, s.metadata FROM campaign_recipients r JOIN students s ON r.student_id = s.id WHERE r.id = $1', [recipientId])
        ]);

        const campaign = campaignArr.rows[0];
        const recipient = recipientArr.rows[0];

        if (!campaign || !recipient) throw new Error('Campaign or recipient not found');

        // 2. Setup Gmail if not provided
        let gmail = gmailInstance;
        let mailboxEmail = '';
        if (!gmail) {
            const mailbox = await getMailboxCredentials(campaign.mailbox_id);
            if (!mailbox || !mailbox.refresh_token_enc) throw new Error('Mailbox not authenticated');
            mailboxEmail = mailbox.email;

            const refreshToken = decryptString(mailbox.refresh_token_enc);
            const oauth2Client = new google.auth.OAuth2(
                env.GOOGLE_CLIENT_ID,
                env.GOOGLE_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: refreshToken });
            gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        }

        // 3. Render Template
        const template = await getTemplateById(campaign.template_id);
        if (!template) throw new Error('Template not found');

        const variables = {
            studentName: recipient.student_name,
            STUDENT_NAME: recipient.student_name,
            studentExternalId: recipient.external_id,
            metadata: recipient.metadata,
            ...(recipient.metadata || {})
        };

        const subject = TemplateRenderer.render(template.subject, variables, {
            config: template.config,
            noLayout: true
        }).replace(/<[^>]*>/g, '').trim();

        const htmlBody = TemplateRenderer.render(template.html, variables, {
            includeAck: campaign.include_ack,
            trackingToken: recipient.tracking_token,
            baseUrl: env.PUBLIC_BASE_URL,
            config: template.config
        });

        // 4. Send via Gmail API
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `MIME-Version: 1.0`,
            `To: ${recipient.to_email}`,
            `From: "UniConnect Support" <${mailboxEmail || 'support@uniconnect.com'}>`, // Best effort or dynamic
            `Subject: ${utf8Subject}`,
            `X-UniConnect-Token: ${recipient.tracking_token}`,
            `Content-Type: text/html; charset=utf-8`,
            `Content-Transfer-Encoding: base64`,
            '',
            Buffer.from(htmlBody).toString('base64')
        ];

        const rawMessage = messageParts.join('\r\n');
        const encodedMail = Buffer.from(rawMessage).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMail }
        });

        // 5. Update DB
        await db.query(
            `UPDATE campaign_recipients 
             SET status = 'SENT', sent_at = NOW(), gmail_message_id = $1, error_message = NULL, updated_at = NOW() 
             WHERE id = $2`,
            [res.data.id, recipientId]
        );

        await db.query(
            `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1`,
            [campaignId]
        );

        return { success: true, messageId: res.data.id };

    } catch (err: any) {
        console.error(`[CAMPAIGN_SENDER] Error for recipient ${recipientId}:`, err.message);

        await db.query(
            `UPDATE campaign_recipients 
             SET status = 'FAILED', error_message = $1, updated_at = NOW() 
             WHERE id = $2`,
            [err.message, recipientId]
        );

        await db.query(
            `UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1`,
            [campaignId]
        );

        return { success: false, error: err.message };
    }
}
