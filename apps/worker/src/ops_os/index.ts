/**
 * Operations OS — worker registration.
 *
 * Phase 0 registers the queues but installs only logging handlers — no real
 * work is dispatched yet. This keeps the queue topology live (jobs can be
 * enqueued, BullMQ has consumers ready) without prematurely shipping
 * processor logic that hasn't been spec'd.
 *
 * Activation roadmap:
 *   Phase 2: source_pull handler (pull from 7 source systems)
 *   Phase 3: auto_flag_eval handler (rule engine)
 *   Phase 3: notification_dispatch handler (in-app + email + SMS)
 *   Phase 3: mv_refresh handler (materialized view refresh)
 *   Phase 4: pattern_detection handler (weekly 6-campus rule)
 *   Ongoing: nightly_rollup handler (reliability scoring etc.)
 */

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAMES = [
    'ops_os.source_pull',
    'ops_os.auto_flag_eval',
    'ops_os.notification_dispatch',
    'ops_os.mv_refresh',
    'ops_os.pattern_detection',
    'ops_os.nightly_rollup',
] as const;

type QueueName = typeof QUEUE_NAMES[number];

const workers = new Map<QueueName, Worker>();

/**
 * Register all ops_os workers. Call once from apps/worker/src/index.ts at boot.
 *
 * Each worker installs a Phase-0 no-op handler that just logs receipt. When a
 * phase's real handler is ready, replace the handler argument here with the
 * real function — the queue topology and connection management stay identical.
 */
export function registerOpsOsWorkers(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    connection.on('error', (err) =>
        console.error('[OPS_OS_WORKER] Redis error:', err.message),
    );

    for (const name of QUEUE_NAMES) {
        const w = new Worker(
            name,
            async (job: Job) => {
                console.log(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'info',
                        scope: 'ops_os.worker',
                        msg: 'job_received_phase0_noop',
                        queue: name,
                        job_id: job.id,
                        job_name: job.name,
                    }),
                );
                // Phase 0 deliberately does no work. Returning succeeds the job.
                // Phase 2+ swaps this for real processors per queue.
                return { phase: 0, processed: false };
            },
            { connection, concurrency: 1 },
        );

        w.on('failed', (job, err) => {
            console.error(
                JSON.stringify({
                    ts: new Date().toISOString(),
                    level: 'error',
                    scope: 'ops_os.worker',
                    msg: 'job_failed',
                    queue: name,
                    job_id: job?.id,
                    error: err.message,
                }),
            );
        });

        workers.set(name, w);
        console.log(`[OPS_OS_WORKER] ✅ Registered: ${name}`);
    }
}

/** Graceful shutdown — call on SIGTERM. */
export async function shutdownOpsOsWorkers(): Promise<void> {
    for (const [name, w] of workers) {
        try {
            await w.close();
            console.log(`[OPS_OS_WORKER] 🛑 Closed: ${name}`);
        } catch (e) {
            console.error(`[OPS_OS_WORKER] failed to close ${name}:`, (e as Error).message);
        }
    }
}
