import { getAllUniversities, getUniversityById, getAssessmentBatches, getAssessmentBranches } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;

    let universities: any[] = [];
    // ADMIN / PROGRAM_OPS and SME see ALL universities (SME is an
    // all-universities examinations role with no single university_id).
    if (locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' || locals.user.role === 'SME') {
        universities = await getAllUniversities();
    } else if (locals.user.university_id) {
        const uni = await getUniversityById(locals.user.university_id);
        if (uni) universities = [uni];
    }

    let activeUniId = universityId;
    if (!activeUniId && universities.length > 0) {
        activeUniId = universities[0].id;
    }

    let batches: any[] = [];
    let branches: any[] = [];

    if (activeUniId) {
        const results = await Promise.allSettled([
            getAssessmentBatches(activeUniId),
            getAssessmentBranches(activeUniId)
        ]);

        if (results[0].status === 'fulfilled') batches = results[0].value;
        if (results[1].status === 'fulfilled') branches = results[1].value;
    }

    return {
        universities,
        batches,
        branches,
        selectedUniversityId: activeUniId
    };
};
