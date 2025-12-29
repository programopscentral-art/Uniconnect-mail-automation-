import { getGoogleAuthUrl } from '$lib/server/auth';
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
    const url = getGoogleAuthUrl();
    throw redirect(302, url);
};
