import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeeRemarks, createFeeRemark, deleteFeeRemark, toggleFeeStudentTag } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const remarks = await getFeeRemarks(params.id);
    return json(remarks);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    if (!params.id) throw error(400, 'id required');
    const body = await request.json();
    if (!body.text || !body.author_name) throw error(400, 'text and author_name required');

    const remark = await createFeeRemark({
        student_payment_id: params.id,
        author_id: locals.user!.id,
        author_name: body.author_name,
        role: body.role || locals.user!.role || 'Other',
        case_type: body.case_type || undefined,
        text: body.text,
        source: 'manual'
    });

    // If a case_type was selected, auto-add it as a tag
    if (body.case_type && body.case_type.length > 0) {
        try {
            await toggleFeeStudentTag(params.id, body.case_type, locals.user!.id);
        } catch {}
    }
    return json(remark);
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    const remarkId = url.searchParams.get('remark_id');
    if (!remarkId) throw error(400, 'remark_id required');
    await deleteFeeRemark(remarkId);
    return json({ success: true });
};
