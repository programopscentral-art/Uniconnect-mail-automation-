import { SchedulingService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — list timetable versions
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId required');

    const termId = url.searchParams.get('termId') || undefined;
    const versions = await SchedulingService.getVersions(universityId, termId);
    return json(versions);
};

// POST — publish a timetable version
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const { versionId, universityId } = await request.json();
    if (!versionId || !universityId) throw error(400, 'versionId and universityId required');

    try {
        await SchedulingService.publishTimetable(universityId, versionId, locals.user!.id);
        return json({ success: true });
    } catch (e: any) {
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
