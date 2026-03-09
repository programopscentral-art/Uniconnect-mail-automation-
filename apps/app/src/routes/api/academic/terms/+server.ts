import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const programId = url.searchParams.get('programId');
    if (!programId) throw error(400, 'programId is required');

    const terms = await AcademicService.getTerms(programId);
    return json(terms);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, program_id, name, start_date, end_date } = await request.json();
    if (!university_id || !program_id || !name || !start_date || !end_date) {
        throw error(400, 'university_id, program_id, name, start_date, and end_date are required');
    }

    const term = await AcademicService.createTerm(university_id, program_id, {
        name,
        start_date: new Date(start_date),
        end_date: new Date(end_date)
    });
    return json(term);
};
