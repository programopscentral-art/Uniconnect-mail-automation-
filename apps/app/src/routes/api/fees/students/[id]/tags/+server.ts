import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toggleFeeStudentTag, getFeeStudentTags } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const tags = await getFeeStudentTags(params.id);
    return json(tags);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    if (!params.id) throw error(400, 'id required');
    const body = await request.json();
    if (!body.tag) throw error(400, 'tag required');
    const result = await toggleFeeStudentTag(params.id, body.tag, locals.user!.id);
    return json(result);
};
