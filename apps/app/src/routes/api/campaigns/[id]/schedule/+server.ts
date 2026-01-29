import { db, getCampaignById, getStudents, createRecipients, getCampaignRecipients, getTemplateById, getMailboxCredentials, decryptString, TemplateRenderer } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    try {
        console.log(`[CAMPAIGN_START] Starting campaign ${campaignId}`);

        // Populate process.env for shared package crypto
        process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

        // 1. Get template
        const template = await getTemplateById(campaign.template_id);
        if (!template) {
            return json({ success: false, message: 'Template not found' }, { status: 400 });
        }

        // 2. Get mailbox credentials
        const mailbox = await getMailboxCredentials(campaign.mailbox_id);
        if (!mailbox || !mailbox.refresh_token_enc) {
            return json({ success: false, message: 'Mailbox not authenticated' }, { status: 400 });
        }

        console.log(`[CAMPAIGN_START] Decrypting mailbox credentials...`);
        const refreshToken = decryptString(mailbox.refresh_token_enc);
        if (!refreshToken) {
            return json({ success: false, message: 'Failed to decrypt mailbox credentials' }, { status: 500 });
        }

        // 3. Setup OAuth2
        const oauth2Client = new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        console.log(`[CAMPAIGN_START] Getting access token...`);
        const { token } = await oauth2Client.getAccessToken();
        if (!token) {
            return json({ success: false, message: 'Failed to get access token from Google' }, { status: 500 });
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 4. Get all students
        const students = await getStudents(campaign.university_id, 10000);
        if (students.length === 0) {
            return json({ success: false, message: 'No students found in university' }, { status: 400 });
        }

        console.log(`[CAMPAIGN_START] Found ${students.length} students`);

        // 5. Create recipients if not already created
        await createRecipients(campaignId, students, campaign.recipient_email_key);
        const recipients = await getCampaignRecipients(campaignId);

        // 6. Update campaign status to indicate it has started
        await db.query(
            `UPDATE campaigns SET status = 'IN_PROGRESS', started_at = NOW() WHERE id = $1`,
            [campaignId]
        );

        // --- BACKGROUND SENDING PROCESS ---
        // We're firing this and NOT awaiting it so the user sees immediate "Started" status
        // and the frontend polling handles the "live" progress bar.
        (async () => {
            let sentCount = 0;
            let failedCount = 0;

            console.log(`[BACKGROUND_SEND] Processing ${recipients.length} recipients for campaign ${campaignId}`);

            for (const recipient of recipients.filter(r => r.status === 'PENDING')) {
                try {
                    // Check if campaign was STOPPED in the meantime
                    const { rows: currentCampaign } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
                    if (currentCampaign[0]?.status === 'STOPPED') {
                        console.log(`[BACKGROUND_SEND] Campaign ${campaignId} STOPPED. Aborting loop.`);
                        break;
                    }

                    const student = students.find(s => s.id === recipient.student_id);
                    if (!student) continue;

                    // Prepare variables
                    const variables = {
                        studentName: student.name,
                        STUDENT_NAME: student.name,
                        studentExternalId: student.external_id,
                        metadata: student.metadata,
                        ...(student.metadata || {})
                    };

                    // Render template
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

                    // Send via Gmail API
                    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
                    const messageParts = [
                        `MIME-Version: 1.0`,
                        `To: ${recipient.to_email}`,
                        `From: "NIAT Support" <${mailbox.email}>`,
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

                    // Update recipient status
                    await db.query(
                        `UPDATE campaign_recipients 
                         SET status = 'SENT', sent_at = NOW(), gmail_message_id = $1, updated_at = NOW() 
                         WHERE id = $2`,
                        [res.data.id, recipient.id]
                    );

                    // Update campaign counters in real-time
                    await db.query(
                        `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1`,
                        [campaignId]
                    );

                    sentCount++;
                    console.log(`[BACKGROUND_SEND] ✅ Sent to ${recipient.to_email} (${sentCount}/${recipients.length})`);

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (err: any) {
                    console.error(`[BACKGROUND_SEND] ❌ Failed to send to ${recipient.to_email}:`, err.message);

                    await db.query(
                        `UPDATE campaign_recipients 
                         SET status = 'FAILED', error_message = $1, updated_at = NOW() 
                         WHERE id = $2`,
                        [err.message, recipient.id]
                    );

                    await db.query(
                        `UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1`,
                        [campaignId]
                    );

                    failedCount++;
                }
            }

            // Final completion update
            const { rows: finalCampaign } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
            if (finalCampaign[0]?.status === 'IN_PROGRESS') {
                await db.query(
                    `UPDATE campaigns 
                     SET status = 'COMPLETED', completed_at = NOW() 
                     WHERE id = $1`,
                    [campaignId]
                );
            }
            console.log(`[BACKGROUND_SEND_COMPLETE] Campaign ${campaignId} finished.`);
        })();

        return json({
            success: true,
            message: 'Campaign started successfully in background!'
        });

    } catch (err: any) {
        console.error(`[CAMPAIGN_ERROR] Failed for campaign ${campaignId}:`, err);

        // Mark campaign as failed
        await db.query(
            `UPDATE campaigns SET status = 'FAILED' WHERE id = $1`,
            [campaignId]
        ).catch(console.error);

        return json({
            success: false,
            message: err.message || 'Internal server error while starting campaign'
        }, { status: 500 });
    }
};
