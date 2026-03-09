import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const programId = url.searchParams.get('programId');
    if (!programId) throw error(400, 'programId is required');

    const terms = await AcademicService.getTerms(programId);
    return json(terms);
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
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

export const PATCH: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { id, ...updates } = await request.json();
    if (!id) throw error(400, 'id is required');

    if (updates.start_date) updates.start_date = new Date(updates.start_date);
    if (updates.end_date) updates.end_date = new Date(updates.end_date);

    await AcademicService.updateTerm(id, updates);
    return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await AcademicService.deleteTerm(id);
    return json({ success: true });
};
