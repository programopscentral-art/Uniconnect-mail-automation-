import { deleteStudent } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const id = url.searchParams.get('id');
    let universityId = url.searchParams.get('universityId');

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id!;
    }

    if (!id || !universityId) {
        throw error(400, 'ID and University ID are required');
    }

    try {
        await deleteStudent(id, universityId);
        return json({ success: true });
    } catch (err: any) {
        console.error('Delete Student Error:', err);
        throw error(500, 'Failed to delete student');
    }
};
