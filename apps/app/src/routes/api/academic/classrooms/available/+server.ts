import { ClassroomService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    const date = url.searchParams.get('date');
    const slotStart = url.searchParams.get('slotStart');
    const slotEnd = url.searchParams.get('slotEnd');
    const minCapacity = url.searchParams.get('minCapacity');

    if (!universityId || !date || !slotStart || !slotEnd) {
        throw error(400, 'universityId, date, slotStart, slotEnd required');
    }

    try {
        const rooms = await ClassroomService.getAvailableClassrooms(
            universityId, date, slotStart, slotEnd,
            minCapacity ? parseInt(minCapacity) : undefined
        );
        return json(rooms);
    } catch (e: any) {
        console.error('[GET /api/academic/classrooms/available]', e.message);
        return json([]);
    }
};
