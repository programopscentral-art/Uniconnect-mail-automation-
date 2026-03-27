import { json, error } from '@sveltejs/kit';
import { SecurityPinService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

const ADMIN_ROLES = ['ADMIN', 'PROGRAM_OPS'];

// GET: List all users with PIN access status
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user || !ADMIN_ROLES.includes(locals.user.role as string)) {
        throw error(403, 'Only administrators can manage PIN access');
    }

    const users = await SecurityPinService.listPinAccessUsers();
    return json({ users });
};

// POST: Grant or revoke PIN access for a user
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user || !ADMIN_ROLES.includes(locals.user.role as string)) {
        throw error(403, 'Only administrators can manage PIN access');
    }

    const { userId, action } = await request.json();

    if (!userId) throw error(400, 'userId is required');
    if (!['grant', 'revoke'].includes(action)) throw error(400, 'action must be "grant" or "revoke"');

    if (action === 'grant') {
        await SecurityPinService.grantPinAccess(userId);
    } else {
        await SecurityPinService.revokePinAccess(userId);
    }

    return json({ success: true, action });
};
