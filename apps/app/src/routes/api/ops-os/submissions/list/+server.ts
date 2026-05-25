/**
 * GET /api/ops-os/submissions/list
 *
 * RLS-scoped list of submissions, used by the PM review queue and BOA
 * "my submissions" view. Query params (all optional):
 *   - statuses: comma-separated SubmissionStatus values
 *   - cadence: DAILY | WEEKLY | MONTHLY (default DAILY)
 *   - campus_id: UUID
 *   - period_from / period_to: ISO date inclusive
 *   - limit: integer, capped at 200
 *
 * Auth: 'view' — any role with ops_os visibility. RLS narrows to the
 * caller's scope (BOA = own campus, PM = assigned campuses, ADMIN = all).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withReadOnlyUserContext,
    listSubmissions,
    type Cadence,
    type SubmissionStatus,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

const VALID_STATUSES: ReadonlyArray<SubmissionStatus> = [
    'NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW', 'SENT_BACK', 'SIGNED_OFF', 'LOCKED', 'RETRACTED',
];

export const GET: RequestHandler = async ({ url, locals }) => {
    const actor = checkOpsOsAccess(locals, 'view');

    const statusesRaw = url.searchParams.get('statuses');
    const cadenceRaw = url.searchParams.get('cadence') || 'DAILY';
    const campusId = url.searchParams.get('campus_id') || undefined;
    const periodFrom = url.searchParams.get('period_from') || undefined;
    const periodTo = url.searchParams.get('period_to') || undefined;
    const limitRaw = url.searchParams.get('limit');

    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(cadenceRaw)) {
        throw error(400, 'cadence must be DAILY | WEEKLY | MONTHLY');
    }
    const cadence = cadenceRaw as Cadence;

    let statuses: SubmissionStatus[] | undefined;
    if (statusesRaw) {
        const parsed = statusesRaw.split(',').map(s => s.trim()).filter(Boolean);
        for (const s of parsed) {
            if (!VALID_STATUSES.includes(s as SubmissionStatus)) {
                throw error(400, `invalid status: ${s}`);
            }
        }
        statuses = parsed as SubmissionStatus[];
    }

    const limit = Math.min(parseInt(limitRaw || '50', 10) || 50, 200);

    const rows = await withReadOnlyUserContext(actor.user_id, actor.role, async (client) => {
        return listSubmissions(
            {
                statuses,
                cadence,
                campus_id: campusId,
                period_start_from: periodFrom,
                period_start_to: periodTo,
                limit,
            },
            client,
        );
    });

    return json({ rows, count: rows.length });
};
