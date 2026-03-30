import { getMeetingAuthUrl } from '$lib/server/meeting_auth';
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    // Only ADMIN and PROGRAM_OPS can connect meeting bot
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Only admins can connect the meeting bot');
    }

    let universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'University ID required');

    const authUrl = getMeetingAuthUrl(universityId);
    throw redirect(302, authUrl);
};
