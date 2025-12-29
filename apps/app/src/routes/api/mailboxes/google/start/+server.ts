import { getMailboxAuthUrl } from '$lib/server/mailbox_auth';
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    const authUrl = getMailboxAuthUrl(universityId);
    throw redirect(302, authUrl);
};
