/**
 * GET /api/ops-os/submissions/:id/events
 *
 * Chronological event log for one submission. Used by the read-only
 * operations drill-down page to render the timeline of state changes
 * (created → field updates → submitted → sent_back / signed_off → locked).
 *
 * Auth: 'view'. RLS narrows visibility — caller can only get events for
 * submissions they can read.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withReadOnlyUserContext,
    getSubmissionEvents,
    getSubmissionById,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

export const GET: RequestHandler = async ({ params, locals }) => {
    const actor = checkOpsOsAccess(locals, 'view');
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission_id required');

    const result = await withReadOnlyUserContext(actor.user_id, actor.role, async (client) => {
        // Confirm visibility via RLS on submission first — if they can't see
        // the submission, they shouldn't get its event log either.
        const sub = await getSubmissionById(submission_id, client);
        if (!sub) return null;
        const events = await getSubmissionEvents(submission_id, client);
        return { submission_id, events };
    });

    if (!result) throw error(404, 'submission not found or out of scope');
    return json(result);
};
