import { StudentService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, program_id, term_id, section_id, students } = await request.json();

    if (!university_id || !program_id || !term_id || !section_id || !students || !Array.isArray(students)) {
        throw error(400, 'Missing required fields or invalid students array');
    }

    const results = await StudentService.importStudents(university_id, program_id, term_id, section_id, students);
    return json(results);
};
