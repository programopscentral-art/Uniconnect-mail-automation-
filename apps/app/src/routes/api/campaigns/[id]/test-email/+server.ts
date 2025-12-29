import { getCampaignById, getStudents, getTemplateById } from '@uniconnect/shared';
import { addEmailJob } from '$lib/server/queue';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
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

    // 1. Get a sample student to populate placeholders
    const students = await getStudents(campaign.university_id, 1);
    if (students.length === 0) {
        throw error(400, 'No students found in university to use as sample data');
    }
    const sampleStudent = students[0];

    // 2. Enqueue a single test job
    const trackingToken = 'test_' + crypto.randomBytes(8).toString('hex');

    await addEmailJob({
        recipientId: 'test_recipient',
        campaignId: campaign.id,
        email: testEmail,
        trackingToken: trackingToken,
        templateId: campaign.template_id,
        mailboxId: campaign.mailbox_id,
        includeAck: campaign.include_ack,
        attempts: 1,
        variables: {
            studentName: sampleStudent.name,
            studentExternalId: sampleStudent.external_id,
            metadata: sampleStudent.metadata,
            // Mock variables for commonly used placeholders in test emails
            COUPON_CODE: sampleStudent.metadata?.COUPON_CODE || 'TEST-COUPON-2026',
            fee_table_rows: [] // Ensure table logic triggers
        }
    });

    return json({ success: true, message: `Test email enqueued to ${testEmail}` });
};
