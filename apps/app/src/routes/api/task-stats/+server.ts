import { getTaskStats } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const rawUnivId = url.searchParams.get('university_id')?.trim() || undefined;
    const isAllRequested = rawUnivId === 'all' || rawUnivId === '';
    let university_id = (isAllRequested ? undefined : rawUnivId);

    // Strict Multi-Tenant Enforcement — skip filter when user explicitly chose "All Universities"
    const isGlobalAdmin = (locals.user.role as any) === 'ADMIN' || (locals.user.role as any) === 'PROGRAM_OPS';
    if (!isGlobalAdmin && !isAllRequested) {
        university_id = locals.user.university_id || undefined;
    }

    const stats = await getTaskStats(university_id, locals.user.id);
    return json(stats);
};
