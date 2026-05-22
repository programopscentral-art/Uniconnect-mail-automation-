/**
 * Idempotency helper.
 *
 * Every operational write API should be safe to retry. Clients send an
 * idempotency_key; the server stores it on first execution and returns the
 * cached result on subsequent calls.
 *
 * Retention: 24h. A nightly job (TODO Phase 1) prunes older rows. Even
 * without pruning, the table doesn't explode because key cardinality is
 * bounded by the number of distinct client operations per day.
 */

import type { PoolClient } from 'pg';
import { db } from '../db/client';

export interface IdempotencyClaim {
    /** True if this is the first time we've seen this key (claim acquired). */
    isFirstCall: boolean;
    /** If !isFirstCall, the recorded result hash from the first call (for client to compare). */
    result_hash: string | null;
}

/**
 * Atomically attempt to claim an idempotency key. If the key is new, we
 * insert a row and return isFirstCall = true. If it already exists, we
 * return isFirstCall = false plus the stored result_hash.
 *
 * The caller should:
 *   - If isFirstCall, proceed with the operation; on success, call
 *     recordIdempotencyResult() to memoize.
 *   - If !isFirstCall, return the cached result OR refuse the duplicate call.
 *
 * Note: this is INSERT ... ON CONFLICT, so it's safe to call concurrently;
 * exactly one caller wins the claim.
 */
export async function claimIdempotency(
    idempotency_key: string,
    operation: string,
    client?: PoolClient,
): Promise<IdempotencyClaim> {
    const exec = client ?? db;
    const result = await exec.query(
        `INSERT INTO ops_os.idempotency_log (idempotency_key, operation)
         VALUES ($1, $2)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotency_key, operation],
    );

    if (result.rowCount && result.rowCount > 0) {
        return { isFirstCall: true, result_hash: null };
    }

    const existing = await exec.query(
        `SELECT result_hash FROM ops_os.idempotency_log WHERE idempotency_key = $1`,
        [idempotency_key],
    );
    return {
        isFirstCall: false,
        result_hash: existing.rows[0]?.result_hash ?? null,
    };
}

/**
 * Record the result hash for an idempotency key after the operation
 * succeeded. Allows future duplicate calls to verify the cached result.
 */
export async function recordIdempotencyResult(
    idempotency_key: string,
    result_hash: string,
    client?: PoolClient,
): Promise<void> {
    const exec = client ?? db;
    await exec.query(
        `UPDATE ops_os.idempotency_log SET result_hash = $2 WHERE idempotency_key = $1`,
        [idempotency_key, result_hash],
    );
}

/**
 * Convenience: wrap an async operation in an idempotency guard.
 * On duplicate call, throws — caller should catch and translate to 409.
 */
export async function withIdempotency<T>(
    idempotency_key: string,
    operation: string,
    fn: () => Promise<T>,
    client?: PoolClient,
): Promise<T> {
    const claim = await claimIdempotency(idempotency_key, operation, client);
    if (!claim.isFirstCall) {
        const err: Error & { code?: string } = new Error(
            `idempotency replay: key=${idempotency_key} operation=${operation}`,
        );
        err.code = 'IDEMPOTENCY_REPLAY';
        throw err;
    }
    return await fn();
}
