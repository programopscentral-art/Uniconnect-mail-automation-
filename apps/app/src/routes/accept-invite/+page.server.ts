import { error } from '@sveltejs/kit';
import { getInvitationByToken } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const token = url.searchParams.get('token');
    if (!token) {
        throw error(400, 'Invitation token is required');
    }

    const invite = await getInvitationByToken(token);
    if (!invite) {
        throw error(404, 'Invitation not found or expired');
    }

    return { invite };
};
