import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PATCH — admin approves or rejects a leave request
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { approval_status } = await request.json();
    if (!['APPROVED', 'REJECTED'].includes(approval_status)) {
        throw error(400, 'approval_status must be APPROVED or REJECTED');
    }

    const result = await db.query(
        `UPDATE faculty_leave_requests
         SET approval_status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, approval_status`,
        [approval_status, params.id]
    );

    if (!result.rows[0]) throw error(404, 'Leave request not found');
    return json(result.rows[0]);
};
