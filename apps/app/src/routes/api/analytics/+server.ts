import { getTeamAnalytics, getAllUniversities } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;

    const isGlobalOps = ['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string);

    // Non-admin users can only see their own university
    const effectiveUniversityId = isGlobalOps
        ? (universityId === 'ALL' ? undefined : universityId)
        : locals.user.university_id || undefined;

    const team = await getTeamAnalytics({
        universityId: effectiveUniversityId,
        dateFrom,
        dateTo,
    });

    const universities = isGlobalOps ? await getAllUniversities() : [];

    return json({
        team,
        universities: Array.isArray(universities) ? universities : [],
    });
};
