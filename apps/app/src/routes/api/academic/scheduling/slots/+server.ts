import { SchedulingService, db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — list university slots
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) throw error(400, 'universityId required');

    const slots = await SchedulingService.getSlots(universityId);
    return json(slots);
};

// POST — create a new slot
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const { universityId, name, start_time, end_time, slot_type } = await request.json();
    if (!universityId || !start_time || !end_time) {
        throw error(400, 'universityId, start_time, end_time required');
    }

    try {
        const res = await db.query(
            `INSERT INTO university_slots (university_id, name, start_time, end_time, slot_type)
             VALUES ($1, $2, $3::TIME, $4::TIME, $5)
             ON CONFLICT (university_id, start_time, end_time) DO UPDATE SET name = $2, slot_type = $5
             RETURNING *`,
            [universityId, name || 'Slot', start_time, end_time, slot_type || 'LECTURE']
        );
        return json(res.rows[0]);
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
