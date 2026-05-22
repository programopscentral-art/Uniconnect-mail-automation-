/**
 * Event log — the audit, replay, and observability spine.
 *
 * Every operationally significant state change writes exactly one row.
 * Events are immutable, idempotent (via idempotency_key), and queryable
 * by (aggregate_kind, aggregate_id) for full per-entity history.
 *
 * Rule: writes that affect operational state MUST emit an event. Reads do
 * not (would be too noisy). Section 7 reads are an exception — they go to
 * section_7_access_log, not event_log.
 */

import type { PoolClient } from 'pg';
import { db } from '../db/client';
import type { AggregateKind, EventLogEntry, EventType } from './types';

export interface EmitEventInput {
    event_type: EventType;
    aggregate_kind: AggregateKind;
    aggregate_id: string;
    payload?: Record<string, unknown>;
    actor_user_id?: string | null;
    campus_id?: string | null;
    idempotency_key?: string;
}

/**
 * Emit a single event. If `client` is provided, the write happens in the
 * caller's transaction (preferred — keeps the event atomic with the
 * state change that caused it). Otherwise a one-off insert is performed.
 *
 * On idempotency_key conflict, the existing row is returned — the operation
 * is treated as already-applied.
 */
export async function emitEvent(
    input: EmitEventInput,
    client?: PoolClient,
): Promise<EventLogEntry> {
    const exec = client ?? db;
    const result = await exec.query(
        `INSERT INTO ops_os.event_log
            (event_type, aggregate_kind, aggregate_id, payload, actor_user_id, campus_id, idempotency_key)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (idempotency_key) DO UPDATE SET event_type = excluded.event_type
         RETURNING *`,
        [
            input.event_type,
            input.aggregate_kind,
            input.aggregate_id,
            JSON.stringify(input.payload ?? {}),
            input.actor_user_id ?? null,
            input.campus_id ?? null,
            input.idempotency_key ?? null,
        ],
    );
    return result.rows[0] as EventLogEntry;
}

/**
 * Read the full event history for one aggregate, oldest first.
 * Useful for: rebuilding state, audit views, debugging.
 */
export async function getEventsForAggregate(
    aggregate_kind: AggregateKind,
    aggregate_id: string,
    client?: PoolClient,
): Promise<EventLogEntry[]> {
    const exec = client ?? db;
    const result = await exec.query(
        `SELECT * FROM ops_os.event_log
         WHERE aggregate_kind = $1 AND aggregate_id = $2
         ORDER BY recorded_at ASC`,
        [aggregate_kind, aggregate_id],
    );
    return result.rows as EventLogEntry[];
}

/**
 * Read recent events of a given type. Used by signal extractors and
 * pattern detectors that want to process new events since a high-water mark.
 */
export async function getEventsByTypeSince(
    event_type: EventType,
    since: Date,
    limit = 1000,
    client?: PoolClient,
): Promise<EventLogEntry[]> {
    const exec = client ?? db;
    const result = await exec.query(
        `SELECT * FROM ops_os.event_log
         WHERE event_type = $1 AND recorded_at > $2
         ORDER BY recorded_at ASC
         LIMIT $3`,
        [event_type, since, limit],
    );
    return result.rows as EventLogEntry[];
}
