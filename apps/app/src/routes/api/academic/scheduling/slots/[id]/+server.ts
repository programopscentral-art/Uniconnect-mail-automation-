import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PATCH — update a slot
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const { name, start_time, end_time, slot_type, is_active } = await request.json();

    const res = await db.query(
        `UPDATE university_slots
         SET name = COALESCE($2, name),
             start_time = COALESCE($3::TIME, start_time),
             end_time = COALESCE($4::TIME, end_time),
             slot_type = COALESCE($5, slot_type),
             is_active = COALESCE($6, is_active)
         WHERE id = $1
         RETURNING *`,
        [params.id, name, start_time, end_time, slot_type, is_active]
    );

    if (!res.rows[0]) throw error(404, 'Slot not found');
    return json(res.rows[0]);
};

// DELETE — remove a slot
export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    await db.query('DELETE FROM university_slots WHERE id = $1', [params.id]);
    return json({ success: true });
};
