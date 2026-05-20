import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeStudentById, getFeeRemarks } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const [student, remarks] = await Promise.all([
        getFeeStudentById(params.id),
        getFeeRemarks(params.id)
    ]);
    if (!student) throw error(404, 'Student not found');
    return json({ student, remarks });
};
