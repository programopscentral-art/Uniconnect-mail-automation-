import { getAllAccessRequests } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS';
    if (!isGlobalAdmin) throw error(403, 'Forbidden');

    const requests = await getAllAccessRequests();
    return json(requests);
};
