import { FacultyService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, faculty_list } = await request.json();

    if (!university_id || !faculty_list || !Array.isArray(faculty_list)) {
        throw error(400, 'University ID and faculty list are required');
    }

    const results = await FacultyService.importFaculty(university_id, faculty_list);
    return json(results);
};
