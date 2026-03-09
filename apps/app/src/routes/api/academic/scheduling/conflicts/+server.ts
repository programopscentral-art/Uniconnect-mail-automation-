import { json, type RequestHandler } from '@sveltejs/kit';
import { db, SchedulingService } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ locals, url }) => {
    // 1. Get university context
    const universityId = url.searchParams.get('universityId') || 'fb508d81-9b16-43b6-963d-4c311c1e5d31'; // Default or from session
    const versionId = url.searchParams.get('versionId');

    try {
        const conflicts = await SchedulingService.getAllConflicts(universityId, versionId || undefined);
        return json(conflicts);
    } catch (err: any) {
        console.error('Fetch conflicts error:', err);
        return json({ error: err.message }, { status: 500 });
    }
}
