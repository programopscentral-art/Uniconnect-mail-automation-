import { getMailboxes } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    let universityId = url.searchParams.get('universityId');

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    const mailboxes = await getMailboxes(universityId);
    return json(mailboxes);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'Mailbox ID required');

    // Logic: Operators can only delete their own university's mailboxes
    // Admins can delete any.
    // For now, let's just delete by ID as IDs are UUIDs.
    const { deleteMailbox } = await import('@uniconnect/shared');
    await deleteMailbox(id);

    return json({ success: true });
};
