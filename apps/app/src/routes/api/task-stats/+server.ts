import { getTaskStats } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    let university_id = url.searchParams.get('university_id') || undefined;

    // Strict Multi-Tenant Enforcement
    const isGlobalAdmin = (locals.user.role as any) === 'ADMIN' || (locals.user.role as any) === 'PROGRAM_OPS';
    if (!isGlobalAdmin) {
        university_id = locals.user.university_id || undefined;
    }

    const stats = await getTaskStats(university_id, locals.user.id);
    return json(stats);
};
