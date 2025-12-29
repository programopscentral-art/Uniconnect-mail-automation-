import { getAllUniversities, createUniversity } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    if (locals.user?.role !== 'ADMIN') {
        throw error(403, 'Forbidden');
    }
    const universities = await getAllUniversities();
    return json(universities);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN') {
        throw error(403, 'Forbidden');
    }
    const { name, slug } = await request.json();
    if (!name || !slug) {
        throw error(400, 'Name and slug are required');
    }

    try {
        const university = await createUniversity(name, slug);
        return json(university);
    } catch (err: any) {
        if (err.code === '23505') { // Unique violation
            throw error(409, 'University with this slug already exists');
        }
        throw err;
    }
};
