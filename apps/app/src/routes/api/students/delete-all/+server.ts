import { deleteAllStudents } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    let universityId = url.searchParams.get('universityId');

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id!;
    }

    if (!universityId) {
        throw error(400, 'University ID is required');
    }

    try {
        await deleteAllStudents(universityId);
        return json({ success: true });
    } catch (err: any) {
        console.error('Delete All Students Error:', err);
        throw error(500, 'Failed to delete students');
    }
};
