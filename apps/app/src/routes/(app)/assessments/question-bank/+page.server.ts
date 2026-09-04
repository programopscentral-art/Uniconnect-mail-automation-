import { error } from '@sveltejs/kit';
import { getAllUniversities, getUniversityById } from '@uniconnect/shared';
import { isExamGlobal } from '$lib/server/assessment_access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    if (!isExamGlobal(locals.user) && !locals.user.university_id) {
        throw error(403, 'You do not have access to the question bank uploader.');
    }

    let universities: any[] = [];
    if (isExamGlobal(locals.user)) {
        universities = await getAllUniversities();
    } else if (locals.user.university_id) {
        const uni = await getUniversityById(locals.user.university_id);
        if (uni) universities = [uni];
    }

    return {
        universities: JSON.parse(JSON.stringify(universities)),
        canGlobal: isExamGlobal(locals.user),
    };
};
