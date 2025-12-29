import { getMailboxes, getAllUniversities, getMailboxPermissions } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    let mailboxes: any[] = [];
    let universities: any[] = [];
    let permissions: any[] = [];

    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    const isUnivAdmin = locals.user.role === 'UNIVERSITY_OPERATOR';

    if (isGlobalAdmin) {
        universities = await getAllUniversities();
    } else if (isUnivAdmin || locals.user.university_id) {
        // University Admin or Regular Team Member
        const universityId = locals.user.university_id!;
        [mailboxes, permissions] = await Promise.all([
            getMailboxes(universityId),
            getMailboxPermissions(universityId)
        ]);
    }

    return {
        mailboxes,
        universities,
        permissions,
        userRole: locals.user.role,
        userId: locals.user.id,
        userUniversityId: locals.user.university_id
    };
};
