/**
 * GET  /api/fees2/windows/:id/daily?date=YYYY-MM-DD
 *   → Daily Report per-university counts (Fully / Partial / Yet / Total) for a
 *     date. Past dates and days locked at 8 PM IST serve the frozen snapshot;
 *     today (pre-lock) is computed live. Defaults to today (IST).
 *
 * POST /api/fees2/windows/:id/daily
 *   → Admin-only "lock now": freeze today's per-university counts immediately
 *     (same operation the 20:00 IST worker job performs). Also accepts the
 *     worker's x-internal-sync-token so the scheduled job can call it.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { checkFeeAccess, isAdminRole, todayInIST } from '$lib/server/fee_access';
import { getDailyReport, captureDailyUniversitySnapshot } from '$lib/server/fee_daily';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ params, locals, url }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');
    const date = (url.searchParams.get('date') || '').trim() || todayInIST();
    if (!DATE_RE.test(date)) throw error(400, 'date must be YYYY-MM-DD');
    const report = await getDailyReport(params.id, date);
    return json(report);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    if (!params.id) throw error(400, 'id required');
    // Allow either an admin session or the worker's internal token.
    const token = request.headers.get('x-internal-sync-token');
    const internalOk = !!env.INTERNAL_SYNC_TOKEN && token === env.INTERNAL_SYNC_TOKEN;
    if (!internalOk) {
        checkFeeAccess(locals, 'view');
        if (!isAdminRole(locals)) throw error(403, 'Only admins can lock the daily report.');
    }
    const result = await captureDailyUniversitySnapshot(params.id, { locked: true });
    return json({ ok: true, ...result });
};
