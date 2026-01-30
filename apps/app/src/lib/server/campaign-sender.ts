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
    // Prepare environment for decryption
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    try {

        // 1. Fetch Fresh Data
        const [campaignArr, recipientArr] = await Promise.all([
            db.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]),
            db.query('SELECT r.*, s.name as student_name, s.external_id, s.metadata FROM campaign_recipients r JOIN students s ON r.student_id = s.id WHERE r.id = $1', [recipientId])
        ]);

        const campaign = campaignArr.rows[0];
        const recipient = recipientArr.rows[0];

        if (!campaign || !recipient) throw new Error('Campaign or recipient not found');

        console.log(`[CAMPAIGN_SENDER] Recipient Row ID: ${recipientId}`);
        console.log(`[CAMPAIGN_SENDER] Student metadata for merge:`, recipient.metadata ? (typeof recipient.metadata === 'string' ? recipient.metadata : JSON.stringify(recipient.metadata)) : 'MISSING');

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

        // Robust Metadata Handling
        let metaObj = recipient.metadata;
        if (typeof metaObj === 'string') {
            try { metaObj = JSON.parse(metaObj); } catch (e) { metaObj = {}; }
        }
        metaObj = metaObj || {};

        const variables = {
            studentName: recipient.student_name,
            STUDENT_NAME: recipient.student_name,
            name: recipient.student_name,
            studentExternalId: recipient.external_id,
            metadata: metaObj,
            ...metaObj
        };

        console.log(`[CAMPAIGN_SENDER] Keys found in Metadata:`, Object.keys(metaObj));
        console.log(`[CAMPAIGN_SENDER] Variables Keys for Merge:`, Object.keys(variables));

        // SPECIFIC DEBUGGING REQUESTED BY USER
        const key1 = "Term 1 Fee adjustment (O/S +ve and Excess -Ve)";
        const key2 = "Total Term 2 Fee Payabale (Includes Term 2 & Term 1 adjustments)";

        console.log(`\n--- [DEBUG_MERGE_REPORT] ---`);
        console.log(`RecipientId: ${recipientId}`);
        console.log(`StudentId/RowId: ${recipient.student_id}`);
        console.log(`Flow Context: ${gmailInstance ? 'BULK/RESUME' : 'SINGLE_RESEND'}`); // Best guess based on gmailInstance presence
        console.log(`All Metadata Keys (${Object.keys(metaObj).length}):`, JSON.stringify(Object.keys(metaObj)));

        console.log(`Target Key 1: ["${key1}"]`);
        console.log(`Value in metaObj: ${metaObj[key1] !== undefined ? JSON.stringify(metaObj[key1]) : 'MISSING'}`);
        console.log(`Value in variables: ${variables[key1] !== undefined ? JSON.stringify(variables[key1]) : 'MISSING'}`);

        console.log(`Target Key 2: ["${key2}"]`);
        console.log(`Value in metaObj: ${metaObj[key2] !== undefined ? JSON.stringify(metaObj[key2]) : 'MISSING'}`);
        console.log(`Value in variables: ${variables[key2] !== undefined ? JSON.stringify(variables[key2]) : 'MISSING'}`);
        console.log(`--- [END_DEBUG_MERGE_REPORT] ---\n`);

        // Log all variables except large ones for debugging
        const logVars = { ...variables };
        delete (logVars as any).metadata;
        // console.log(`[CAMPAIGN_SENDER] Resolved Variables Map:`, JSON.stringify(logVars, null, 2));

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

        console.log(`[CAMPAIGN_SENDER] Rendered Body Length: ${htmlBody.length} bytes`);
        console.log(`[CAMPAIGN_SENDER] Body Snippet: ${htmlBody.slice(0, 500)}...`);

        // 4. Send via Gmail API
        const targetEmail = String(recipient.to_email || '').trim();

        console.log(`[CAMPAIGN_SENDER] Preparing to send email...`);
        console.log(`[CAMPAIGN_SENDER] To: ${targetEmail}, From: ${mailboxEmail || 'support@uniconnect.com'}`);
        console.log(`[CAMPAIGN_SENDER] Subject: ${subject.slice(0, 50)}...`);
        console.log(`[CAMPAIGN_SENDER] Recipient ID: ${recipientId}, Tracking Token: ${recipient.tracking_token}`);

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `MIME-Version: 1.0`,
            `To: ${targetEmail}`,
            `From: "NIAT Program Operations" <${mailboxEmail || 'programops@uniconnect.com'}>`, // Standardized Branding
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

        console.log(`[CAMPAIGN_SENDER] Sending via Gmail API to: ${targetEmail}`);
        const sendResult = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMail
            }
        });

        const gmailMessageId = sendResult.data.id;
        console.log(`[CAMPAIGN_SENDER] ✅ Gmail API Success! Message ID: ${gmailMessageId}`);
        // 5. Update DB Atomically
        const updateRes = await db.query(
            `UPDATE campaign_recipients 
             SET status = 'SENT', 
                 sent_at = NOW(), 
                 gmail_message_id = $1, 
                 error_message = NULL, 
                 updated_at = NOW() 
             WHERE id = $2 AND status NOT IN ('SENT', 'FAILED', 'CANCELLED')
             RETURNING campaign_id`,
            [gmailMessageId, recipientId]
        );

        if (updateRes.rows[0]) {
            await db.query(
                `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1`,
                [campaignId]
            );
        }

        return { success: true, messageId: res.data.id };

    } catch (err: any) {
        console.error(`[CAMPAIGN_SENDER] Error for recipient ${recipientId}: `, err.message);

        const updateRes = await db.query(
            `UPDATE campaign_recipients 
             SET status = 'FAILED',
            error_message = $1,
            updated_at = NOW() 
             WHERE id = $2 AND status NOT IN('SENT', 'FAILED', 'CANCELLED')
             RETURNING campaign_id`,
            [err.message, recipientId]
        );

        if (updateRes.rows[0]) {
            await db.query(
                `UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1`,
                [campaignId]
            );
        }

        return { success: false, error: err.message };
    }
}
