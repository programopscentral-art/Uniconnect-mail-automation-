import { json, error } from '@sveltejs/kit';
import { createAccessRequest, getAdmins, createNotification } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { universityIds } = await request.json();

    if (!Array.isArray(universityIds) || universityIds.length === 0) {
        throw error(400, 'At least one university ID is required');
    }

    try {
        const ar = await createAccessRequest(locals.user.id, universityIds);

        // Notify Admins
        const universityId = universityIds[0]; // Use first for context, or loop
        const admins = await getAdmins(universityId);

        for (const admin of admins) {
            await createNotification({
                user_id: admin.id,
                university_id: universityId,
                title: 'New Access Request',
                message: `${locals.user.name || locals.user.email} is requesting access to ${universityIds.length} universities.`,
                type: 'ACCESS_REQUEST',
                link: '/users'
            });
        }

        return json(ar);
    } catch (err: any) {
        console.error('Failed to create access request:', err);
        throw error(500, 'Internal Server Error');
    }
};
