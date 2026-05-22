/**
 * POST /api/ops-os/submissions
 *
 * Idempotent create: if a submission already exists for (campus, cadence,
 * period), return it. Otherwise create a new one in NEW state.
 *
 * Auth: 'submit' mode — BOA + admins. Campus scope enforced by RLS in
 * withUserContext.
 *
 * Request body:
 *   { campus_id, cadence, period_start, period_end, idempotency_key }
 *
 * Response: full submission row
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    createSubmission,
    findCurrentSubmission,
    claimIdempotency,
    recordIdempotencyResult,
    type Cadence,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.create');

export const POST: RequestHandler = async ({ request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'submit');
    const body = await request.json();

    const campus_id = String(body.campus_id ?? '').trim();
    const cadence = String(body.cadence ?? '').trim() as Cadence;
    const period_start = String(body.period_start ?? '').trim();
    const period_end = String(body.period_end ?? '').trim();
    const idempotency_key = String(body.idempotency_key ?? '').trim();

    if (!campus_id || !cadence || !period_start || !period_end || !idempotency_key) {
        throw error(400, 'campus_id, cadence, period_start, period_end, idempotency_key required');
    }
    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(cadence)) {
        throw error(400, 'cadence must be DAILY | WEEKLY | MONTHLY');
    }

    const submission = await withUserContext(actor.user_id, actor.role, async (client) => {
        // Idempotency: same key → return cached, no double-create
        const claim = await claimIdempotency(idempotency_key, 'submissions.create', client);
        if (!claim.isFirstCall) {
            // The original creation succeeded; look up the resulting submission
            const existing = await findCurrentSubmission(
                { campus_id, cadence, period_start, period_end },
                client,
            );
            if (existing) return existing;
            throw error(409, 'idempotency replay but no submission found — investigate');
        }

        // Find-or-create at the period level (separate from idempotency_key,
        // because retries from different clients might race for the same period)
        const existing = await findCurrentSubmission(
            { campus_id, cadence, period_start, period_end },
            client,
        );
        if (existing) {
            await recordIdempotencyResult(idempotency_key, existing.submission_id, client);
            return existing;
        }

        const created = await createSubmission(
            { campus_id, cadence, period_start, period_end, created_by: actor.user_id },
            client,
        );
        await recordIdempotencyResult(idempotency_key, created.submission_id, client);
        return created;
    });

    log.info('submission created or found', {
        actor_user_id: actor.user_id,
        campus_id,
        aggregate_kind: 'submission',
        aggregate_id: submission.submission_id,
    });

    // Notify any open SSE channels for this actor (other tabs/devices)
    opsOsChannels.publish(actor.user_id, {
        event_type: 'submission.created',
        data: { submission_id: submission.submission_id, campus_id, cadence },
    });

    return json(submission);
};
