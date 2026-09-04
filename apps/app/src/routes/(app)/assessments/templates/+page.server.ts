import { error } from '@sveltejs/kit';
import { getAssessmentTemplates, getAllUniversities, getUniversityById } from '@uniconnect/shared';
import { isExamGlobal } from '$lib/server/assessment_access';

export const load = async ({ locals, url }: { locals: any, url: URL }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;

    // Security: Only admins can view templates for other universities
    if (!isExamGlobal(locals.user) && universityId !== locals.user.university_id) {
        throw error(403, 'Unauthorized');
    }

    let universities: any[] = [];
    if (isExamGlobal(locals.user)) {
        universities = await getAllUniversities();
    } else if (locals.user.university_id) {
        const uni = await getUniversityById(locals.user.university_id);
        if (uni) universities = [uni];
    }

    const templates = await getAssessmentTemplates(universityId);

    return {
        templates,
        universities,
        selectedUniversityId: universityId
    };
};
