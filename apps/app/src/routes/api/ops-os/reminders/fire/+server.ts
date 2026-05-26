/**
 * POST /api/ops-os/reminders/fire
 *
 * ADMIN / PROGRAM_OPS only. Manually triggers a reminder batch right now,
 * bypassing the time-of-day window in the worker. Useful for:
 *   - Validating SMTP setup before 3:30 PM
 *   - Re-sending after fixing a config issue
 *   - Smoke-testing during demos
 *
 * Body (or query):
 *   kind:  'boa_submit_due_soon' | 'pm_review_open' | 'pm_review_final'
 *   date:  ISO YYYY-MM-DD (optional, defaults to today IST)
 *   force: boolean (optional, default false) — if true, clears today's
 *          dedupe rows for this kind before running so already-pinged
 *          recipients get the email again. Use only for testing.
 *
 * Returns the full recipient list with per-row delivery status.
 *
 * GET /api/ops-os/reminders/fire?diagnose=1
 *   Same query but skips the actual send. Returns who WOULD be reminded
 *   and whether they were already sent today. Read-only.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, runReminder, todayInIst, type ReminderKind } from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

const VALID_KINDS: ReadonlyArray<ReminderKind> = [
    'boa_submit_due_soon',
    'pm_review_open',
    'pm_review_final',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseInputs(kindRaw: unknown, dateRaw: unknown): { kind: ReminderKind; date: string } {
    const kind = String(kindRaw ?? '').trim() as ReminderKind;
    if (!VALID_KINDS.includes(kind)) {
        throw error(400, `kind must be one of: ${VALID_KINDS.join(', ')}`);
    }
    let date = String(dateRaw ?? '').trim();
    if (!date) date = todayInIst();
    if (!DATE_RE.test(date)) throw error(400, 'date must be YYYY-MM-DD');
    return { kind, date };
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
    checkOpsOsAccess(locals, 'admin');

    const body = await request.json().catch(() => ({}));
    const { kind, date } = parseInputs(
        body?.kind ?? url.searchParams.get('kind'),
        body?.date ?? url.searchParams.get('date'),
    );
    const force = body?.force === true || url.searchParams.get('force') === '1';
    const broadcast = body?.broadcast === true || url.searchParams.get('broadcast') === '1';

    const client = await db.connect();
    try {
        const result = await runReminder(kind, date, client, { force, broadcast });
        return json({
            ok: true,
            kind: result.kind,
            period_start: result.period_start,
            sent: result.sent,
            skipped_already_sent: result.skipped_already_sent,
            email_attempts: result.email_attempts,
            recipients: result.recipients,
            note: force
                ? 'Force=true: dedupe rows for today were cleared, recipients re-notified.'
                : result.sent === 0 && result.skipped_already_sent > 0
                    ? 'All recipients were already sent today. Pass force=true to re-send.'
                    : undefined,
        });
    } finally {
        client.release();
    }
};

export const GET: RequestHandler = async ({ url, locals }) => {
    checkOpsOsAccess(locals, 'admin');
    const { kind, date } = parseInputs(
        url.searchParams.get('kind'),
        url.searchParams.get('date'),
    );
    const broadcast = url.searchParams.get('broadcast') === '1';

    const client = await db.connect();
    try {
        const result = await runReminder(kind, date, client, { diagnose_only: true, broadcast });
        return json({
            ok: true,
            mode: 'diagnose',
            kind: result.kind,
            period_start: result.period_start,
            total_eligible: result.recipients.length,
            already_sent: result.recipients.filter(r => r.already_sent).length,
            would_send: result.recipients.filter(r => !r.already_sent).length,
            recipients: result.recipients,
        });
    } finally {
        client.release();
    }
};
