import { createCampaign, getTemplates, getMailboxes, getAllUniversities } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    // List campaigns? Or dependent resources for wizard?
    // Let's implement List in another file if needed or here using query params
    return json({ error: 'Use separate endpoint for listing' });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const data = await request.json();

    let universityId = data.universityId;
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }
    if (!universityId) throw error(400, 'University ID required');

    const campaign = await createCampaign({
        university_id: universityId,
        name: data.name,
        template_id: data.templateId,
        mailbox_id: data.mailboxId,
        created_by_user_id: locals.user.id,
        recipient_email_key: data.recipientEmailKey || undefined,
        include_ack: data.includeAck
    });

    return json(campaign);
};
