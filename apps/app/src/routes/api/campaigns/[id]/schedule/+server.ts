import { db, getCampaignById, getStudents, createRecipients, getCampaignRecipients, getTemplateById, getMailboxCredentials, decryptString, TemplateRenderer } from '@uniconnect/shared';
import { sendToRecipient } from '$lib/server/campaign-sender';
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
        (async () => {
            console.log(`[BACKGROUND_SEND] Processing ${recipients.length} recipients for campaign ${campaignId}`);

            for (const recipient of recipients.filter(r => r.status === 'PENDING')) {
                // Check if campaign was STOPPED in the meantime
                const { rows: currentCampaign } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
                if (currentCampaign[0]?.status === 'STOPPED') {
                    console.log(`[BACKGROUND_SEND] Campaign ${campaignId} STOPPED. Aborting loop.`);
                    break;
                }

                // Use the shared sender utility
                await sendToRecipient(campaignId, recipient.id, gmail);

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Final completion update
            const { rows: finalCampaign } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
            if (finalCampaign[0]?.status === 'IN_PROGRESS') {
                await db.query(
                    `UPDATE campaigns SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
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
