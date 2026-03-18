import { getTemplates, getMailboxes, getStudents } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    // For admins/ops, scan all students by university (not just their own uploads)
    // so email metadata keys are always detected regardless of who uploaded students
    const isAdmin = ['ADMIN', 'PROGRAM_OPS', 'CENTRAL_TEAM'].includes(locals.user.role || '');
    const [templates, mailboxes, students] = await Promise.all([
        getTemplates(universityId),
        getMailboxes(universityId),
        getStudents({ universityId: universityId || undefined, userId: isAdmin ? undefined : locals.user.id, limit: 100 })
    ]);

    const keys = new Set<string>();
    // Add default student email as a first-class option if not already there
    // Actually, we'll let the user pick from metadata or the default.
    students.forEach(s => {
        Object.keys(s.metadata || {}).forEach(k => {
            if (k.toLowerCase().includes('email') || k.toLowerCase().includes('mail')) {
                keys.add(k);
            }
        });
    });

    const emailMetadataKeys = Array.from(keys);

    return {
        templates,
        mailboxes,
        universityId,
        emailMetadataKeys
    };
};
