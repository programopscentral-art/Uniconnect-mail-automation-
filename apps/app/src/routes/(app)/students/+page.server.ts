import { getStudents, getAllUniversities, getStudentsCount } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    const [students, totalCount, universities] = await Promise.all([
        universityId ? getStudents(universityId, limit, offset) : Promise.resolve([]),
        universityId ? getStudentsCount(universityId) : Promise.resolve(0),
        locals.user.role === 'ADMIN' ? getAllUniversities() : Promise.resolve([])
    ]);

    return {
        students,
        totalCount,
        currentPage: page,
        limit,
        universities,
        selectedUniversityId: universityId,
        userRole: locals.user.role,
        userUniversityId: locals.user.university_id
    };
};
