import { TimetableOpsService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId required');

    try {
        const weeks = await TimetableOpsService.getWeeks(universityId);
        return json(weeks);
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
