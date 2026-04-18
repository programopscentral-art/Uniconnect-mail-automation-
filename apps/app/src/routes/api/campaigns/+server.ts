import { createCampaign, getCampaigns, getTemplates, getMailboxes, getAllUniversities } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    // Respect the selected university from the dropdown. Only fall back
    // to the user's primary university if nothing was explicitly selected.
    let universityId = url.searchParams.get('university_id') || undefined;
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    const campaigns = await getCampaigns(universityId);
    return json(campaigns);
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
