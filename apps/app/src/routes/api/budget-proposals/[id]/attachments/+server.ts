import { json, error } from '@sveltejs/kit';
import { addBudgetProposalAttachment } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const data = await request.json();
    if (!data.file_url || !data.file_name) throw error(400, 'File URL and name required');

    const attachment = await addBudgetProposalAttachment({
        proposal_id: params.id,
        file_url: data.file_url,
        file_name: data.file_name,
        file_type: data.file_type,
        uploaded_by: locals.user.id
    });

    return json(attachment);
};
