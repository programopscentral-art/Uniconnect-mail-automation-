import { getStudents, getAllUniversities, getStudentsCount, getDailySentCount } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const isGlobal = locals.user.permissions?.includes('universities');

    if (!isGlobal && locals.user.university_id) {
        universityId = locals.user.university_id;
    } else if (!universityId && locals.user.university_id) {
        // Default to active session university if no query param
        universityId = locals.user.university_id;
    }

    const [students, totalCount, universities, dailySentCount] = await Promise.all([
        getStudents({ universityId: universityId || undefined, userId: locals.user.id, limit, offset }),
        getStudentsCount(universityId || undefined, locals.user.id),
        isGlobal ? getAllUniversities() : Promise.resolve([]),
        getDailySentCount(universityId || undefined)
    ]);

    return {
        students,
        totalCount,
        currentPage: page,
        limit,
        universities,
        dailySentCount,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userUniversityId: locals.user.university_id
    };
};
