import { getAllUniversities, getAllMailboxes } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user?.permissions?.includes('universities')) {
        throw error(403, 'Forbidden');
    }

    const [universities, mailboxes] = await Promise.all([
        getAllUniversities(),
        getAllMailboxes()
    ]);

    return {
        universities,
        mailboxes
    };
};
