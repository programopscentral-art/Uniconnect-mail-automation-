/**
 * POST /api/ops-os/submissions/:id/retract
 *
 * BOA retracts a just-submitted draft back to DRAFT state for further edits.
 * Allowed only:
 *   - within 30 minutes of submit
 *   - while status = SUBMITTED
 *   - before any PM decision (sign-off or send-back) was recorded
 *
 * Body: { idempotency_key }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    transitionToRetracted,
    claimIdempotency,
    recordIdempotencyResult,
    getSubmissionById,
    notifyPmsOnRetract,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.retract');
const RETRACTION_WINDOW_MIN = 30;

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'submit'); // same scope as create/submit — BOA / PROGRAM_OPS / ADMIN
    const submission_id = params.id;
    if (!submission_id) throw error(400, 'submission_id required');

    const body = await request.json().catch(() => ({}));
    const idempotency_key = String(body.idempotency_key ?? '').trim();
    if (!idempotency_key) throw error(400, 'idempotency_key required');

    const result = await withUserContext(actor.user_id, actor.role, async (client) => {
        const claim = await claimIdempotency(idempotency_key, 'submissions.retract', client);
        if (!claim.isFirstCall) {
            // Replay — return current state without re-attempting
            const current = await getSubmissionById(submission_id, client);
            if (!current) throw error(404, 'submission not found');
            return { kind: 'replay' as const, submission: current };
        }

        const outcome = await transitionToRetracted(
            {
                submission_id,
                actor_user_id: actor.user_id,
                retraction_window_minutes: RETRACTION_WINDOW_MIN,
            },
            client,
        );

        if (!outcome.submission) {
            // Don't record an idempotency result so a different attempt can retry
            return { kind: 'rejected' as const, reason: outcome.reason };
        }

        await recordIdempotencyResult(idempotency_key, outcome.submission.submission_id, client);

        const campusRow = await client.query<{ display_name: string; code: string }>(
            `SELECT display_name, code FROM ops_os.campus_dim WHERE campus_id = $1`,
            [outcome.submission.campus_id],
        );
        await notifyPmsOnRetract(outcome.submission, campusRow.rows[0] ?? null, client);

        return { kind: 'ok' as const, submission: outcome.submission };
    });

    if (result.kind === 'rejected') {
        const map: Record<string, { status: number; msg: string }> = {
            wrong_status: { status: 409, msg: 'Submission is not in SUBMITTED state — cannot retract.' },
            window_closed: { status: 409, msg: `Retraction window of ${RETRACTION_WINDOW_MIN} minutes has closed. Ask PM to send back.` },
            pm_already_reviewing: { status: 409, msg: 'PM has already started review — cannot retract. Ask PM to send back.' },
        };
        const m = map[result.reason];
        throw error(m.status, m.msg);
    }

    log.info('submission retracted', {
        actor_user_id: actor.user_id,
        campus_id: result.submission.campus_id,
        aggregate_kind: 'submission',
        aggregate_id: result.submission.submission_id,
    });

    opsOsChannels.publish(actor.user_id, {
        event_type: 'submission.retracted',
        data: { submission_id: result.submission.submission_id },
    });

    return json(result.submission);
};
