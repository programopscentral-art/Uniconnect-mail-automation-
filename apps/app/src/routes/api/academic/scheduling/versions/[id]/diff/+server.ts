import { TimetableOpsService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — diff this version against another
export const GET: RequestHandler = async ({ params, url }) => {
    const compareWith = url.searchParams.get('compareWith');
    if (!compareWith) throw error(400, 'compareWith version ID required');

    try {
        const diffs = await TimetableOpsService.diffVersions(params.id, compareWith);
        return json({ diffs, count: diffs.length });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
