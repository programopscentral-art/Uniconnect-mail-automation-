import { db, updateCampaignRecipientEmail, getCampaignById } from '@uniconnect/shared';
import { addEmailJob } from '$lib/server/queue';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);

    const campaignId = params.id;
    const recipientId = params.rid;
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
        throw error(400, 'Invalid email address');
    }

    // RBAC: Check if user has access to campaign
    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw error(404, 'Campaign not found');

    if (locals.user.role === 'UNIVERSITY_OPERATOR' && campaign.university_id !== locals.user.university_id) {
        throw error(403, 'Unauthorized');
    }

    try {
        const updated = await updateCampaignRecipientEmail(recipientId, email);

        // Reset campaign status to IN_PROGRESS so it polls and shows STOP button
        await db.query(
            `UPDATE campaigns SET status = 'IN_PROGRESS', failed_count = GREATEST(0, failed_count - 1), updated_at = NOW() WHERE id = $1`,
            [campaignId]
        );

        // Also update the student record to ensure future campaigns use the correct email
        if (updated.student_id) {
            await db.query(
                'UPDATE students SET email = $1 WHERE id = $2',
                [email.toLowerCase().trim(), updated.student_id]
            );
        }

        // Fetch student name and external_id for the job
        const studentRes = await db.query('SELECT name, external_id, metadata FROM students WHERE id = $1', [updated.student_id]);
        const student = studentRes.rows[0];

        // Add job back to queue
        await addEmailJob({
            recipientId: updated.id,
            campaignId: campaignId,
            email: updated.to_email,
            trackingToken: updated.tracking_token,
            templateId: campaign.template_id,
            mailboxId: campaign.mailbox_id,
            variables: {
                studentName: student?.name,
                studentExternalId: student?.external_id,
                metadata: student?.metadata
            }
        });

        return json({ success: true, recipient: updated });
    } catch (err: any) {
        console.error('[RECIPIENT_PATCH] Error:', err);
        throw error(500, err.message);
    }
};
