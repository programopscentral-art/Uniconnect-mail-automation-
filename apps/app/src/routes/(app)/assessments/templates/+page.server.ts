import { error } from '@sveltejs/kit';
import { getAssessmentTemplates } from '@uniconnect/shared';

export const load = async ({ locals, url }: { locals: any, url: URL }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;

    // Security: Only admins can view templates for other universities
    if (locals.user.role !== 'ADMIN' && universityId !== locals.user.university_id) {
        throw error(403, 'Unauthorized');
    }

    const templates = await getAssessmentTemplates(universityId);

    return {
        templates,
        selectedUniversityId: universityId
    };
};
