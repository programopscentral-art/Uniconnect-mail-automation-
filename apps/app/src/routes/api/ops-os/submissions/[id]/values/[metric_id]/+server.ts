/**
 * PATCH /api/ops-os/submissions/:id/values/:metric_id
 *
 * Field autosave. Called on every blur in the BOA daily form. Must be
 * fast (<200ms) and idempotent at the (submission, metric, client_revision)
 * level.
 *
 * Body: { value, value_type, idempotency_key }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withUserContext,
    updateSubmissionValue,
    claimIdempotency,
    recordIdempotencyResult,
    type ValueType,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';
import { createLogger } from '$lib/server/ops_os/logger';
import { opsOsChannels } from '$lib/server/ops_os/sse';

const log = createLogger('api.submissions.value.patch');

const VALID_VALUE_TYPES: ReadonlyArray<ValueType> = [
    'numeric',
    'text',
    'boolean',
    'percentage',
    'currency',
];

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    const actor = checkOpsOsAccess(locals, 'submit');
    const submission_id = params.id;
    const metric_id = params.metric_id;
    if (!submission_id || !metric_id) throw error(400, 'submission_id and metric_id required');

    const body = await request.json();
    const value = body.value ?? null;
    const value_type = String(body.value_type ?? '').trim() as ValueType;
    const idempotency_key = String(body.idempotency_key ?? '').trim();

    if (!VALID_VALUE_TYPES.includes(value_type)) {
        throw error(400, `value_type must be one of: ${VALID_VALUE_TYPES.join(', ')}`);
    }
    if (!idempotency_key) throw error(400, 'idempotency_key required');

    // Type coercion + validation
    let coerced: number | string | boolean | null = null;
    if (value !== null && value !== undefined && value !== '') {
        if (value_type === 'numeric' || value_type === 'percentage' || value_type === 'currency') {
            const n = Number(value);
            if (!Number.isFinite(n)) throw error(400, 'value must be finite number');
            coerced = n;
        } else if (value_type === 'boolean') {
            coerced = Boolean(value);
        } else {
            coerced = String(value);
        }
    }

    const result = await withUserContext(actor.user_id, actor.role, async (client) => {
        const claim = await claimIdempotency(idempotency_key, 'submissions.value.patch', client);
        if (!claim.isFirstCall) {
            // Replay — treat as success. Client will re-fetch if it cares about the
            // current value. We deliberately don't error on replay because autosave
            // retries are expected from flaky networks.
            return { saved: true, replay: true, threshold_breach: false, edit_emitted: false };
        }

        const updateResult = await updateSubmissionValue(
            {
                submission_id,
                metric_id,
                value: coerced,
                value_type,
                actor_user_id: actor.user_id,
            },
            client,
        );

        await recordIdempotencyResult(idempotency_key, updateResult.recorded_at, client);
        return { saved: true, replay: false, ...updateResult };
    });

    log.info('value patched', {
        actor_user_id: actor.user_id,
        aggregate_kind: 'submission',
        aggregate_id: submission_id,
        metric_id,
        threshold_breach: result.threshold_breach,
        edit_emitted: result.edit_emitted,
    });

    opsOsChannels.publish(actor.user_id, {
        event_type: 'submission.field_updated',
        data: { submission_id, metric_id },
    });

    return json(result);
};
