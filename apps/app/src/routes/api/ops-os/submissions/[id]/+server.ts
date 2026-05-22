/**
 * GET /api/ops-os/submissions/:id
 *
 * Returns the submission row + its value rows. RLS scopes which submission
 * is visible to the caller.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withReadOnlyUserContext,
    getSubmissionById,
    getSubmissionValues,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

export const GET: RequestHandler = async ({ params, locals }) => {
    const actor = checkOpsOsAccess(locals, 'view');
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission id required');

    const result = await withReadOnlyUserContext(actor.user_id, actor.role, async (client) => {
        const submission = await getSubmissionById(submission_id, client);
        if (!submission) return null;
        const values = await getSubmissionValues(submission_id, client);
        return { submission, values };
    });

    if (!result) throw error(404, 'submission not found or out of scope');
    return json(result);
};
