import { invalidateSession } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ cookies }) => {
    const token = cookies.get(env.COOKIE_NAME || 'uniconnect_session');

    if (token) {
        await invalidateSession(token);
        cookies.delete(env.COOKIE_NAME || 'uniconnect_session', { path: '/' });
    }

    throw redirect(302, '/login');
};
