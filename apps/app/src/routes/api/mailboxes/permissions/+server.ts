import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getMailboxPermissions,
    requestMailboxAccess,
    updateMailboxAccessStatus,
    createNotification
} from '@uniconnect/shared';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'University ID required');

    // Only Admin or University Admin can see all permissions
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && universityId !== locals.user.university_id) {
        throw error(403, 'Forbidden');
    }

    const perms = await getMailboxPermissions(universityId);
    return json(perms);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { mailboxId } = await request.json();
    if (!mailboxId) throw error(400, 'Mailbox ID required');

    const perm = await requestMailboxAccess(mailboxId, locals.user.id);

    // Notify university admins?
    // ...

    return json(perm);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    // Only Admin or University Admin
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS' && locals.user.role !== 'UNIVERSITY_OPERATOR') {
        throw error(403, 'Forbidden');
    }

    const { permissionId, status } = await request.json();
    if (!permissionId || !status) throw error(400, 'Missing fields');

    const perm = await updateMailboxAccessStatus(permissionId, status);

    if (status === 'APPROVED') {
        await createNotification({
            user_id: perm.user_id,
            title: 'Mailbox Access Approved',
            message: `Your request for mailbox access has been approved.`,
            type: 'SYSTEM',
            link: '/mailboxes'
        });
    }

    return json(perm);
};
