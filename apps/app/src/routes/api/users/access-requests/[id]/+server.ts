import { json, error } from '@sveltejs/kit';
import { updateAccessRequestStatus, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user || locals.user.role !== 'ADMIN') throw error(401);

    const { id } = params;
    const { status } = await request.json();

    if (!['APPROVED', 'REJECTED'].includes(status)) {
        throw error(400, 'Invalid status');
    }

    try {
        const ar = await updateAccessRequestStatus(id, status);

        if (status === 'APPROVED') {
            // Note: In a full implementation, we might want to store MULTIPLE university IDs.
            // For now, the prompt implies "opening the respective college".
            // If they are Nxtwave users, they might manage multiple.
            // Requirement says: "if they have to access any college a permission must be sent... they should be given option to select colleges"
            // "if admin accepts permission will be granted"

            // For now, we'll keep the first university ID as their primary but in a real app 
            // we'd probably have a many-to-many relationship.
            // The dashboard/stats logic currently uses universityId query param.
            // So we just need the UI to let them select from approved ones.

            // I will update the user's university_id to the FIRST one in the request as a default
            // but the dashboard logic already supports universityId selection for ADMINS.
            // For Nxtwave users, we should allow them to pass universityId if it's in their approved list.

            if (ar.university_ids.length > 0) {
                await db.query(`UPDATE users SET university_id = $1 WHERE id = $2`, [ar.university_ids[0], ar.user_id]);
            }
        }

        return json(ar);
    } catch (err: any) {
        console.error('Failed to update access request:', err);
        throw error(500, 'Internal Server Error');
    }
};
