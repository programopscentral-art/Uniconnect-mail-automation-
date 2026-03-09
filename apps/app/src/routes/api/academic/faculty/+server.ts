import { FacultyService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId is required');

    // For now, we'll return all faculty in the university. 
    // In a real app, logic would use the faculty_profiles table.
    // Since we just ran migrations, this table is likely empty.
    const result = await FacultyService.getProfileByUserId('some-placeholder'); // This is just to test service link

    // Let's implement a real list fetcher in the service or here
    // For the UI demonstration, I'll return a sample or the real DB empty list
    return json([]);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const data = await request.json();
    const profile = await FacultyService.createProfile(data);
    return json(profile);
};
