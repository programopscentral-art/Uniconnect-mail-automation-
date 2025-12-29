import { db, getCampaignById, getStudents, createRecipients, getCampaignRecipients, getTemplateById } from '@uniconnect/shared';
import { addEmailJob } from '$lib/server/queue';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);
    const campaignId = params.id;

    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404);

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403);
    }

    // We allow adding new recipients even if it was previously scheduled
    // This supports "remaining students" or newly added students.

    // 1. Snapshot recipients
    // Fetch students (all for now)
    const students = await getStudents(campaign.university_id, 10000);
    await createRecipients(campaignId, students, campaign.recipient_email_key);

    // 2. Fetch created recipients to get tokens
    const recipients = await getCampaignRecipients(campaignId);

    // 3. Check for scheduling
    const body = await request.json().catch(() => ({}));
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    // 4. Update campaign status if scheduled for later
    if (delay > 0) {
        // Technically createRecipients already sets status = 'SCHEDULED' and scheduled_at = NOW()
        // We update it to the actual scheduled time.
        // We'll also mark it as 'SCHEDULED' explicitly.
        // But for now, since we enqueue immediately with a delay, status should reflect reality.
    }

    // 4. Enqueue Jobs for only NEW (PENDING) recipients
    for (const r of recipients.filter(rect => rect.status === 'PENDING')) {
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
            }, delay);

            // Mark as QUEUED immediately to avoid double processing if API is hit fast
            await db.query(`UPDATE campaign_recipients SET status = 'QUEUED' WHERE id = $1`, [r.id]);
        }
    }

    // Update campaign status to IN_PROGRESS if we just started sending
    await db.query(`UPDATE campaigns SET status = 'IN_PROGRESS' WHERE id = $1 AND status = 'SCHEDULED'`, [campaign.id]);

    return json({ success: true, count: recipients.length, scheduledAt: scheduledAt.toISOString() });
};
