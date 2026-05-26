/**
 * POST /api/ops-os/submissions/:id/submit
 *
 * BOA marks the submission complete. Transitions DRAFT → SUBMITTED.
 * From this point the PM owns the next state transition (sign-off OR send-back).
 *
 * Body: { idempotency_key, deadline?: ISO timestamp }
 *   - deadline (optional): if past, sets is_late_submission flag
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    transitionToSubmitted,
    claimIdempotency,
    recordIdempotencyResult,
    getSubmissionById,
    notifyPmsOnSubmission,
    notifyOnIncidents,
    detectSetIncidentFlags,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.submit');

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'submit');
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission_id required');

    const body = await request.json().catch(() => ({}));
    const idempotency_key = String(body.idempotency_key ?? '').trim();
    if (!idempotency_key) throw error(400, 'idempotency_key required');
    const deadline = body.deadline ? new Date(body.deadline) : undefined;

    const submission = await withUserContext(actor.user_id, actor.role, async (client) => {
        const claim = await claimIdempotency(idempotency_key, 'submissions.submit', client);
        if (!claim.isFirstCall) {
            // Already submitted — return current state, don't double-transition
            const current = await getSubmissionById(submission_id, client);
            if (!current) throw error(404, 'submission not found');
            return current;
        }

        const updated = await transitionToSubmitted(
            { submission_id, submitted_by: actor.user_id, deadline },
            client,
        );
        await recordIdempotencyResult(idempotency_key, updated.submission_id, client);

        // Fan out handoff notifications inside the same transaction so they
        // roll back with the transition if anything below fails.
        const campusRow = await client.query<{ display_name: string; code: string }>(
            `SELECT display_name, code FROM ops_os.campus_dim WHERE campus_id = $1`,
            [updated.campus_id],
        );
        const campus = campusRow.rows[0] ?? null;
        await notifyPmsOnSubmission(updated, campus, client);

        const flags = await detectSetIncidentFlags(updated.submission_id, client);
        if (flags.length > 0) {
            await notifyOnIncidents(updated, campus, flags, client);
        }

        return updated;
    });

    log.info('submission submitted', {
        actor_user_id: actor.user_id,
        campus_id: submission.campus_id,
        aggregate_kind: 'submission',
        aggregate_id: submission.submission_id,
        is_late: submission.is_late_submission,
    });

    opsOsChannels.publish(actor.user_id, {
        event_type: 'submission.submitted',
        data: { submission_id, campus_id: submission.campus_id },
    });

    return json(submission);
};
