import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const termId = url.searchParams.get('termId');
    if (!termId) throw error(400, 'termId is required');

    const subjects = await AcademicService.getSubjects(termId);
    return json(subjects);
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, program_id, term_id, name, code, credit_value, total_sessions } = await request.json();

    if (!university_id || !program_id || !term_id || !name) {
        throw error(400, 'Missing required fields (university_id, program_id, term_id, name)');
    }

    const subject = await AcademicService.createSubject(university_id, program_id, term_id, {
        name,
        code: code || undefined,
        credit_value: Number(credit_value) || 0,
        total_sessions: Number(total_sessions) || 30
    });
    return json(subject);
};
