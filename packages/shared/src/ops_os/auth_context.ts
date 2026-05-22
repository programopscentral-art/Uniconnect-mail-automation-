/**
 * RLS user-context helper.
 *
 * Postgres RLS policies in ops_os reference `app.current_user_id` and
 * `app.current_user_role`. These are set per-transaction via `SET LOCAL`,
 * which means every operation that needs RLS must run inside a transaction
 * with the user context bound.
 *
 * Usage:
 *
 *   await withUserContext(userId, role, async (client) => {
 *       const r = await client.query('SELECT ... FROM ops_os.submission');
 *       // ...
 *   });
 *
 * The callback receives a checked-out pg client. RLS evaluates against the
 * session variables set in the same transaction. After the callback returns,
 * the transaction COMMITs (or ROLLBACKs on throw) and the client is released.
 */

import type { PoolClient } from 'pg';
import { db } from '../db/client';

export interface UserContext {
    userId: string;
    role: string;
}

/**
 * Run a callback inside a transaction with RLS user context bound.
 *
 * @throws Error from callback after ROLLBACK. The original error propagates;
 *         the rollback itself does not swallow it.
 */
export async function withUserContext<T>(
    userId: string,
    role: string,
    fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        // SET LOCAL is bound to the current transaction only — safe with pooled connections.
        await client.query(`SET LOCAL app.current_user_id = '${escapeIdentifier(userId)}'`);
        await client.query(`SET LOCAL app.current_user_role = '${escapeIdentifier(role)}'`);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* connection may be dead */ }
        throw e;
    } finally {
        client.release();
    }
}

/**
 * Variant for read-only operations. Same behavior but the transaction is
 * marked READ ONLY which prevents accidental writes through this path.
 */
export async function withReadOnlyUserContext<T>(
    userId: string,
    role: string,
    fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await db.connect();
    try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL app.current_user_id = '${escapeIdentifier(userId)}'`);
        await client.query(`SET LOCAL app.current_user_role = '${escapeIdentifier(role)}'`);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
    } finally {
        client.release();
    }
}

/**
 * String escape for SET LOCAL values. Postgres SET LOCAL doesn't support
 * parameter binding for the value, so we sanitize. UUIDs and our role strings
 * are restricted character sets, so this is sufficient — but we still reject
 * anything outside the safe character set to prevent SQL injection through
 * the user-context channel.
 */
function escapeIdentifier(value: string): string {
    if (!/^[A-Za-z0-9_\-]+$/.test(value)) {
        throw new Error(`ops_os auth_context: unsafe identifier "${value}"`);
    }
    return value;
}
