import { getUserDetailedAnalytics } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const userId = url.searchParams.get('userId');
    if (!userId) throw error(400, 'userId required');

    const isGlobalOps = ['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string);

    // Non-admin users can only view their own analytics
    if (!isGlobalOps && userId !== locals.user.id) {
        throw error(403, 'You can only view your own analytics');
    }

    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;

    const data = await getUserDetailedAnalytics(userId, { dateFrom, dateTo });
    if (!data) throw error(404, 'User not found');

    return json(data);
};
