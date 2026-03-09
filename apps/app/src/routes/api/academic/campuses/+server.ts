import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId is required');

    const campuses = await AcademicService.getCampuses(universityId);
    return json(campuses);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, name, code, address, status } = await request.json();
    if (!university_id || !name || !code) {
        throw error(400, 'University ID, name and code are required');
    }

    const campus = await AcademicService.createCampus({ university_id, name, code, address, status: status || 'ACTIVE' });
    return json(campus);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { id, ...updates } = await request.json();
    if (!id) throw error(400, 'id is required');

    await AcademicService.updateCampus(id, updates);
    return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await AcademicService.deleteCampus(id);
    return json({ success: true });
};
