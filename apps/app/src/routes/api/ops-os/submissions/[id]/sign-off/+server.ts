/**
 * POST /api/ops-os/submissions/:id/sign-off
 *
 * PM signs off, transitioning SUBMITTED → SIGNED_OFF. PM remark required.
 * Once SIGNED_OFF, the submission_value table's immutability trigger
 * prevents further changes; amendments require a new supersedes submission.
 *
 * Body: { pm_remark, idempotency_key, deadline?: ISO timestamp }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    transitionToSignedOff,
    claimIdempotency,
    recordIdempotencyResult,
    getSubmissionById,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.sign_off');

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'sign_off');
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission_id required');

    const body = await request.json().catch(() => ({}));
    const pm_remark = String(body.pm_remark ?? '').trim();
    const idempotency_key = String(body.idempotency_key ?? '').trim();
    if (!pm_remark) throw error(400, 'pm_remark required');
    if (!idempotency_key) throw error(400, 'idempotency_key required');
    const deadline = body.deadline ? new Date(body.deadline) : undefined;

    const submission = await withUserContext(actor.user_id, actor.role, async (client) => {
        const claim = await claimIdempotency(idempotency_key, 'submissions.sign_off', client);
        if (!claim.isFirstCall) {
            const current = await getSubmissionById(submission_id, client);
            if (!current) throw error(404, 'submission not found');
            return current;
        }

        const updated = await transitionToSignedOff(
            { submission_id, signed_off_by: actor.user_id, pm_remark, deadline },
            client,
        );
        await recordIdempotencyResult(idempotency_key, updated.submission_id, client);
        return updated;
    });

    log.info('submission signed off', {
        actor_user_id: actor.user_id,
        campus_id: submission.campus_id,
        aggregate_kind: 'submission',
        aggregate_id: submission.submission_id,
        is_late: submission.is_late_sign_off,
    });

    opsOsChannels.publish(actor.user_id, {
        event_type: 'submission.signed_off',
        data: { submission_id, campus_id: submission.campus_id },
    });

    return json(submission);
};
