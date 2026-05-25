/**
 * UniConnect Operations OS — shared package public surface.
 *
 * Phase 0: types, event log, idempotency, submission repository, RLS context.
 * Subsequent phases will add: source integrations, auto-flag engine,
 * notification dispatch, pattern detection, materialized views.
 *
 * Boundary rule: nothing outside the ops_os namespace may import directly
 * from ops_os/<internal-file>. Always import from ops_os/index.
 */

export * from './types';
export * from './auth_context';
export * from './event_log';
export * from './idempotency';
export * from './submissions';
export * from './operations';
