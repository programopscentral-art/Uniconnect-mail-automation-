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

    const [templates, mailboxes, students] = await Promise.all([
        getTemplates(universityId),
        getMailboxes(universityId),
        getStudents(universityId, 100) // Get top 100 to extract keys
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
