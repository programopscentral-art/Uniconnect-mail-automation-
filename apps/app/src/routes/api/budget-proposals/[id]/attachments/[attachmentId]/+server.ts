import { json, error } from '@sveltejs/kit';
import { deleteBudgetProposalAttachment } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const deleted = await deleteBudgetProposalAttachment(params.attachmentId, params.id);
        if (!deleted) throw error(404, 'Attachment not found');

        return json({ success: true, deleted });
    } catch (e: any) {
        console.error('[ATTACHMENT_DELETE_ERROR]', e);
        throw error(e.status || 500, e.message || 'Internal Server Error');
    }
};
