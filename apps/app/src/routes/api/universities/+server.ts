import { getAllUniversities, createUniversity } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    // Allow read access for roles that need university listings
    const readAllowedRoles = ['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS', 'UNIVERSITY_OPERATOR', 'BOA'];
    if (!readAllowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Forbidden');
    }
    // Teams are universities with is_team=true. Default response excludes them
    // (they're a different concept), but the team-assignment dropdown on the
    // user management page needs them — caller passes ?includeTeams=true.
    const includeTeams = url.searchParams.get('includeTeams') === 'true';
    const universities = await getAllUniversities({ includeTeams });
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
