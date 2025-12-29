import { getStudents, createStudent, createStudentsBulk, deleteStudent } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    let universityId = url.searchParams.get('universityId');

    // RBAC
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        if (universityId && universityId !== locals.user.university_id) {
            throw error(403, 'Forbidden');
        }
        universityId = locals.user.university_id;
    }

    if (!universityId) {
        // If admin and no ID provided, maybe return empty or error?
        // Let's require it for simplicity
        throw error(400, 'University ID required');
    }

    const students = await getStudents(universityId);
    return json(students);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const data = await request.json();

    // Determine University ID
    let universityId = data.universityId;
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    // Check if bulk upload via JSON (or CSV handling separately, but maybe here too)
    // If single creation:
    const student = await createStudent({
        university_id: universityId,
        name: data.name,
        email: data.email,
        external_id: data.external_id,
        metadata: data.metadata
    });

    return json(student);
};
