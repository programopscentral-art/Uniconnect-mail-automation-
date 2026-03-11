import { json, error, type RequestHandler } from '@sveltejs/kit';
import { SchedulingService } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId required');

    const versionId = url.searchParams.get('versionId');

    try {
        const conflicts = await SchedulingService.getAllConflicts(universityId, versionId || undefined);
        return json(conflicts);
    } catch (err: any) {
        console.error('Fetch conflicts error:', err);
        return json([], { status: 500 });
    }
}
