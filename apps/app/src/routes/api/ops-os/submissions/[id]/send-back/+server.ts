/**
 * POST /api/ops-os/submissions/:id/send-back
 *
 * PM returns submission to BOA for correction. Increments sent_back_count
 * (tracked reliability signal). Allowed from SUBMITTED or PM_REVIEW.
 *
 * Body: { reason_code, reason_text?, idempotency_key }
 *   reason_code: 'data_inconsistency' | 'missing_field' | 'needs_clarification' | 'other'
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    transitionToSentBack,
    claimIdempotency,
    recordIdempotencyResult,
    getSubmissionById,
    type SendBackReasonCode,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.send_back');

const VALID_REASONS: ReadonlyArray<SendBackReasonCode> = [
    'data_inconsistency',
    'missing_field',
    'needs_clarification',
    'other',
];

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'send_back');
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission_id required');

    const body = await request.json().catch(() => ({}));
    const reason_code = String(body.reason_code ?? '').trim() as SendBackReasonCode;
    const reason_text = body.reason_text ? String(body.reason_text).trim() : undefined;
    const idempotency_key = String(body.idempotency_key ?? '').trim();

    if (!VALID_REASONS.includes(reason_code)) {
        throw error(400, `reason_code must be one of: ${VALID_REASONS.join(', ')}`);
    }
    if (reason_code === 'other' && !reason_text) {
        throw error(400, 'reason_text required when reason_code is "other"');
    }
    if (!idempotency_key) throw error(400, 'idempotency_key required');

    const submission = await withUserContext(actor.user_id, actor.role, async (client) => {
        const claim = await claimIdempotency(idempotency_key, 'submissions.send_back', client);
        if (!claim.isFirstCall) {
            const current = await getSubmissionById(submission_id, client);
            if (!current) throw error(404, 'submission not found');
            return current;
        }

        const updated = await transitionToSentBack(
            { submission_id, sent_back_by: actor.user_id, reason_code, reason_text },
            client,
        );
        await recordIdempotencyResult(idempotency_key, updated.submission_id, client);
        return updated;
    });

    log.info('submission sent back', {
        actor_user_id: actor.user_id,
        campus_id: submission.campus_id,
        aggregate_kind: 'submission',
        aggregate_id: submission.submission_id,
        reason_code,
        sent_back_count: submission.sent_back_count,
    });

    if (submission.submitted_by) {
        opsOsChannels.publish(submission.submitted_by, {
            event_type: 'submission.sent_back',
            data: { submission_id, reason_code, sent_back_count: submission.sent_back_count },
        });
    }

    return json(submission);
};
