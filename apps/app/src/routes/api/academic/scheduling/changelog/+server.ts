import { TimetableOpsService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const universityId = url.searchParams.get('universityId');
    const versionId = url.searchParams.get('versionId') || undefined;
    if (!universityId) throw error(400, 'universityId required');

    try {
        const logs = await TimetableOpsService.getChangeLogs(universityId, { versionId, limit: 200 });
        return json(logs);
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
