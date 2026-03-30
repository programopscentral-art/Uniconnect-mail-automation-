import { getMeetingAuthUrl } from '$lib/server/meeting_auth';
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const authUrl = getMeetingAuthUrl(locals.user.id);
    throw redirect(302, authUrl);
};
