import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    const campusId = url.searchParams.get('campusId');
    if (!universityId) throw error(400, 'universityId is required');

    const programs = await AcademicService.getPrograms(universityId, campusId || undefined);
    return json(programs);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, campus_id, name, code, degree_type, semester_count, status } = await request.json();
    if (!university_id || !name || !code) {
        throw error(400, 'University ID, name and code are required');
    }

    const program = await AcademicService.createProgram({ university_id, campus_id, name, code, degree_type, semester_count, status: status || 'ACTIVE' });
    return json(program);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await AcademicService.deleteProgram(id);
    return json({ success: true });
};
