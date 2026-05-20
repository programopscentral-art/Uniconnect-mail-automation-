import { getDocRequestByToken, markDocRequestOpened } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, getClientAddress, request }) => {
    if (!params.token) throw error(400, 'Invalid link');
    const req = await getDocRequestByToken(params.token);
    if (!req) throw error(404, 'This link is invalid or has expired.');

    // Mark as opened
    await markDocRequestOpened(params.token, {
        ip: getClientAddress(),
        ua: request.headers.get('user-agent') || undefined,
    });

    return { request: req, token: params.token };
};
