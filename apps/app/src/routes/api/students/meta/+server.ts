import { getStudentsCount, getDailySentCount } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId') || url.searchParams.get('university_id') || undefined;

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id || undefined;
    }

    if (!universityId) {
        universityId = locals.user.university_id || undefined;
    }

    const [totalCount, dailySentCount] = await Promise.all([
        getStudentsCount(universityId, locals.user.id),
        getDailySentCount(universityId)
    ]);

    return json({ totalCount, dailySentCount });
};
