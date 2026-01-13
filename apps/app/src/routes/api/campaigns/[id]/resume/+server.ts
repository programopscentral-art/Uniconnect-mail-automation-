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

    // 4. Enqueue jobs
    for (const r of recipientsToResume) {
        const student = students.find(s => s.id === r.student_id);
        if (student) {
            await addEmailJob({
                recipientId: r.id,
                campaignId: campaign.id,
                email: r.to_email,
                trackingToken: r.tracking_token,
                templateId: campaign.template_id,
                mailboxId: campaign.mailbox_id,
                includeAck: campaign.include_ack,
                variables: {
                    studentName: student.name,
                    studentExternalId: student.external_id,
                    metadata: student.metadata
                }
            }, 0); // Resume immediately

            // Set to QUEUED
            await db.query(`UPDATE campaign_recipients SET status = 'QUEUED', error_message = NULL WHERE id = $1`, [r.id]);
        }
    }

    return json({
        success: true,
        message: `Campaign resumed! ${recipientsToResume.length} recipients queued.`
    });
};
