/**
 * GET /api/ops-os/operations/daily
 *
 * Operational consumption layer — one row per active campus per date.
 * Used by COS / OPS_HEAD / ADMIN to scan org-wide signed-off truth.
 *
 * Query params:
 *   - date: ISO YYYY-MM-DD (required)
 *   - campuses: comma-separated campus_ids (optional)
 *   - status: NO_SUBMISSION | DRAFT | SUBMITTED | PM_REVIEW | SENT_BACK
 *             | SIGNED_OFF | LOCKED | RETRACTED (optional)
 *   - late_only: 'true' | 'false' (default false)
 *   - incident_only: 'true' | 'false' (default false)
 *
 * Auth: 'view' — RLS narrows to caller's scope.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    withReadOnlyUserContext,
    getDailyOperationsOverview,
    type DailyOpsStatus,
} from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

const VALID_STATUSES: ReadonlyArray<DailyOpsStatus> = [
    'NO_SUBMISSION', 'NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW',
    'SENT_BACK', 'SIGNED_OFF', 'LOCKED', 'RETRACTED',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ url, locals }) => {
    const actor = checkOpsOsAccess(locals, 'view');

    const date = url.searchParams.get('date') || '';
    if (!DATE_RE.test(date)) {
        throw error(400, 'date is required in YYYY-MM-DD format');
    }

    const campusesRaw = url.searchParams.get('campuses') || '';
    const campusIds = campusesRaw
        ? campusesRaw.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

    const statusRaw = url.searchParams.get('status');
    let status: DailyOpsStatus | undefined;
    if (statusRaw) {
        if (!VALID_STATUSES.includes(statusRaw as DailyOpsStatus)) {
            throw error(400, `invalid status: ${statusRaw}`);
        }
        status = statusRaw as DailyOpsStatus;
    }

    const late_only = url.searchParams.get('late_only') === 'true';
    const incident_only = url.searchParams.get('incident_only') === 'true';

    const rows = await withReadOnlyUserContext(actor.user_id, actor.role, async (client) => {
        return getDailyOperationsOverview(
            { date, campus_ids: campusIds, status, late_only, incident_only },
            client,
        );
    });

    return json({ rows, count: rows.length, date });
};
