import { json, error } from '@sveltejs/kit';
import { getPettyCashDashboardStats } from '@uniconnect/shared';
import { scopeUniversity } from '$lib/server/petty_cash_access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const university_id = scopeUniversity(locals.user, url.searchParams.get('university_id') || undefined);
    const stats = await getPettyCashDashboardStats(university_id);
    return json(stats);
};
