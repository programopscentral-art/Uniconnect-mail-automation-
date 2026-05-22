/**
 * Operations OS — structured logger.
 *
 * Single-line JSON per log entry, prefixed with the ops_os scope so it's
 * easy to filter in production log search. Phase 0 logs to stdout/stderr;
 * Phase 5 will pipe to a structured log sink (Logflare or equivalent).
 *
 * Pattern: always include actor_user_id, campus_id, and an aggregate ref
 * if applicable. This lets us trace operations end-to-end across logs +
 * event_log rows.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface OpsOSLogContext {
    actor_user_id?: string;
    campus_id?: string;
    aggregate_kind?: string;
    aggregate_id?: string;
    trace_id?: string;
    [k: string]: unknown;
}

function log(level: LogLevel, scope: string, message: string, ctx?: OpsOSLogContext): void {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        scope: `ops_os.${scope}`,
        msg: message,
        ...(ctx ?? {}),
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

export function createLogger(scope: string) {
    return {
        debug: (msg: string, ctx?: OpsOSLogContext) => log('debug', scope, msg, ctx),
        info: (msg: string, ctx?: OpsOSLogContext) => log('info', scope, msg, ctx),
        warn: (msg: string, ctx?: OpsOSLogContext) => log('warn', scope, msg, ctx),
        error: (msg: string, ctx?: OpsOSLogContext) => log('error', scope, msg, ctx),
    };
}
