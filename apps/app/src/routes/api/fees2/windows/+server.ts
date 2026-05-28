/**
 * GET /api/fees2/windows         — list all active semester windows + sync status
 * POST /api/fees2/windows        — create a new window (admin only)
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const GET: RequestHandler = async ({ locals, url }) => {
    checkFeeAccess(locals, 'view');
    const includeArchived = url.searchParams.get('includeArchived') === '1';
    const r = await db.query(
        `SELECT id, name, program, sheet_id, status,
                auto_sync_enabled, auto_sync_interval_minutes,
                batch_subsheets, dates_subsheet, dropout_subsheet,
                last_synced_at, last_sync_error, last_sync_summary,
                created_at, updated_at
           FROM fee_semester_window
          WHERE $1::bool OR status = 'active'
          ORDER BY status, created_at DESC`,
        [includeArchived],
    );
    return json({ windows: r.rows });
};

export const POST: RequestHandler = async ({ locals, request }) => {
    checkFeeAccess(locals, 'admin');
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const sheet_id = String(body.sheet_id ?? '').trim();
    if (!name) throw error(400, 'name required');
    if (!sheet_id) throw error(400, 'sheet_id required');

    const program = String(body.program ?? 'NIAT').trim() || 'NIAT';
    const batch_subsheets = String(body.batch_subsheets ?? '').trim();
    const dates_subsheet = String(body.dates_subsheet ?? '').trim() || null;
    const dropout_subsheet = String(body.dropout_subsheet ?? '').trim() || null;
    const auto_sync_enabled = body.auto_sync_enabled !== false;
    const auto_sync_interval_minutes = Number(body.auto_sync_interval_minutes) || 30;

    const r = await db.query(
        `INSERT INTO fee_semester_window
            (name, program, sheet_id, batch_subsheets,
             dates_subsheet, dropout_subsheet,
             auto_sync_enabled, auto_sync_interval_minutes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [name, program, sheet_id, batch_subsheets,
         dates_subsheet, dropout_subsheet,
         auto_sync_enabled, auto_sync_interval_minutes,
         locals.user!.id],
    );
    return json({ window: r.rows[0] });
};
