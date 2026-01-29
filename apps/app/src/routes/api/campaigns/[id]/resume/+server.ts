import { db, getCampaignById, getStudents, getCampaignRecipients, getTemplateById } from '@uniconnect/shared';
import { addEmailJob } from '$lib/server/queue';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    // RBAC
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // Only allow resuming if it's currently STOPPED
    if (campaign.status !== 'STOPPED') {
        throw error(400, `Cannot resume a campaign that is not stopped. Current status: ${campaign.status}`);
    }

    // 1. Fetch all students for metadata mapping
    const students = await getStudents(campaign.university_id, 10000);

    // 2. Fetch recipients that need sending
    // We resume anything that is NOT SENT and NOT FAILED
    // Note: status 'CANCELLED' is set by worker when it sees STOPPED status
    const recipients = await getCampaignRecipients(campaignId);
    const recipientsToResume = recipients.filter(r =>
        ['PENDING', 'QUEUED', 'CANCELLED'].includes(r.status)
    );

    if (recipientsToResume.length === 0) {
        // Technically it could be COMPLETED if everything was sent before stop
        await db.query(`UPDATE campaigns SET status = 'COMPLETED' WHERE id = $1`, [campaignId]);
        return json({ success: true, message: 'Nothing to resume, campaign marked as COMPLETED' });
    }

    // 3. Update campaign status to IN_PROGRESS
    await db.query(
        `UPDATE campaigns SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
        [campaignId]
    );

    // 4. Trigger High-Speed Background Loop (using loop-ready sender)
    (async () => {
        try {
            console.log(`[RESUME] Starting high-speed loop for ${recipientsToResume.length} recipients`);

            // Re-setup Gmail
            const mailbox = await getMailboxCredentials(campaign.mailbox_id);
            const refreshToken = decryptString(mailbox.refresh_token_enc);
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: refreshToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            for (const r of recipientsToResume) {
                // Check if STOPPED again in the meantime
                const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
                if (rows[0]?.status === 'STOPPED') break;

                await sendToRecipient(campaignId, r.id, gmail);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const { rows: final } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
            if (final[0]?.status === 'IN_PROGRESS') {
                await db.query(`UPDATE campaigns SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`, [campaignId]);
            }
        } catch (err) {
            console.error('[RESUME_LOOP_ERROR]', err);
        }
    })();

    return json({
        success: true,
        message: `Campaign resumed! ${recipientsToResume.length} recipients queued.`
    });
};
