import { deleteUniversity } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (locals.user?.role !== 'ADMIN') {
        throw error(403, 'Forbidden');
    }
    const { id } = params;
    if (!id) throw error(400, 'ID required');

    await deleteUniversity(id);
    return json({ success: true });
};
