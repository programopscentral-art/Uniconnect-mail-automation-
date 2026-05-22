/**
 * Operations OS — BullMQ queue scaffolding.
 *
 * Phase 0 only defines queues + thin enqueue helpers. Workers are
 * registered in apps/worker/src/ops_os/. No handlers process jobs yet;
 * they will be added per phase:
 *
 *   Phase 2: source_pull
 *   Phase 3: auto_flag_eval, notification_dispatch
 *   Phase 3: mv_refresh
 *   Phase 4: pattern_detection
 *   Ongoing: nightly_rollup
 *
 * Job payload shapes are documented in the Round 4 spec §5.
 *
 * IMPORTANT: This file shares the global IORedis connection with the
 * existing queue.ts in this folder. We import it explicitly to avoid
 * creating a second connection pool.
 */

import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '$env/dynamic/private';

const redisUrl = env.REDIS_URL || 'redis://localhost:6379';

// Standalone IORedis instance for ops_os queues. Each Queue/Worker needs its
// own connection; sharing one across both leads to "Connection in subscriber
// mode" errors when a worker subscribes to events. Workers do their own setup
// in apps/worker; this connection is for producers (the app) only.
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

connection.on('connect', () => console.log('[OPS_OS_QUEUE] ✅ Redis connected'));
connection.on('error', (err) => console.error('[OPS_OS_QUEUE] ❌ Redis error:', err.message));

// ─── Queue names (canonical — workers must match) ───────────────────────

export const OPS_OS_QUEUES = {
    SOURCE_PULL: 'ops_os.source_pull',
    AUTO_FLAG_EVAL: 'ops_os.auto_flag_eval',
    NOTIFICATION_DISPATCH: 'ops_os.notification_dispatch',
    MV_REFRESH: 'ops_os.mv_refresh',
    PATTERN_DETECTION: 'ops_os.pattern_detection',
    NIGHTLY_ROLLUP: 'ops_os.nightly_rollup',
} as const;

// ─── Queues ─────────────────────────────────────────────────────────────

export const sourcePullQueue = new Queue(OPS_OS_QUEUES.SOURCE_PULL, { connection });
export const autoFlagEvalQueue = new Queue(OPS_OS_QUEUES.AUTO_FLAG_EVAL, { connection });
export const notificationDispatchQueue = new Queue(OPS_OS_QUEUES.NOTIFICATION_DISPATCH, { connection });
export const mvRefreshQueue = new Queue(OPS_OS_QUEUES.MV_REFRESH, { connection });
export const patternDetectionQueue = new Queue(OPS_OS_QUEUES.PATTERN_DETECTION, { connection });
export const nightlyRollupQueue = new Queue(OPS_OS_QUEUES.NIGHTLY_ROLLUP, { connection });

console.log('[OPS_OS_QUEUE_INIT] Queues registered:', Object.values(OPS_OS_QUEUES).join(', '));

// ─── Job payload types ──────────────────────────────────────────────────

export interface AutoFlagEvalJob {
    trigger_event: string;
    aggregate_kind: 'submission' | 'edit' | 'source';
    aggregate_id: string;
}

export interface NotificationDispatchJob {
    dispatch_id: string;
    flag_id: string;
    channel: 'in_app' | 'email' | 'sms';
    recipient_user_id: string;
}

export interface MVRefreshJob {
    view_name: 'mv_campus_status_today' | 'mv_monthly_scorecard' | 'mv_pattern_themes_current_week';
    trigger: string;
    debounce_key?: string;
}

export interface SourcePullJob {
    source_system: string;
    campus_ids: string[];
    trigger: 'scheduled_4pm' | 'manual_refresh' | 'webhook' | 'reconcile';
    period_start: string;
    period_end: string;
    pull_log_id: string;
}

// ─── Enqueue helpers (used by API routes + signal extractors) ───────────

const DEFAULT_OPTS: JobsOptions = {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
};

export async function enqueueAutoFlagEval(data: AutoFlagEvalJob): Promise<string | undefined> {
    const job = await autoFlagEvalQueue.add('eval', data, {
        ...DEFAULT_OPTS,
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
    });
    return job.id;
}

export async function enqueueNotificationDispatch(data: NotificationDispatchJob): Promise<string | undefined> {
    const job = await notificationDispatchQueue.add('dispatch', data, {
        ...DEFAULT_OPTS,
        attempts: data.channel === 'sms' ? 2 : 5,
        backoff: { type: 'exponential', delay: 60000 },
        // Idempotency at the queue level: BullMQ jobId prevents duplicate enqueue
        jobId: `${data.flag_id}:${data.recipient_user_id}:${data.channel}`,
    });
    return job.id;
}

export async function enqueueMVRefresh(data: MVRefreshJob): Promise<string | undefined> {
    // Debounce: jobs with same debounce_key collapse to one execution
    const job = await mvRefreshQueue.add('refresh', data, {
        ...DEFAULT_OPTS,
        attempts: 2,
        delay: 30000, // 30s window — multiple events in this window collapse
        jobId: data.debounce_key ?? `refresh:${data.view_name}:${Date.now()}`,
    });
    return job.id;
}
