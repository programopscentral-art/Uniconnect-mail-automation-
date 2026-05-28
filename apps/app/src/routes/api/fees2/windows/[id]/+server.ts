/**
 * PATCH  /api/fees2/windows/:id    — update window settings (admin)
 * DELETE /api/fees2/windows/:id    — archive a window (admin) — sets status='archived'
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    checkFeeAccess(locals, 'admin');
    if (!params.id) throw error(400, 'id required');
    const body = await request.json().catch(() => ({}));

    const fields: string[] = [];
    const args: unknown[] = [params.id];
    const set = (col: string, val: unknown) => {
        args.push(val);
        fields.push(`${col} = $${args.length}`);
    };

    if (body.name !== undefined) set('name', String(body.name).trim());
    if (body.sheet_id !== undefined) set('sheet_id', String(body.sheet_id).trim());
    if (body.batch_subsheets !== undefined) set('batch_subsheets', String(body.batch_subsheets).trim());
    if (body.dates_subsheet !== undefined) set('dates_subsheet', String(body.dates_subsheet).trim() || null);
    if (body.dropout_subsheet !== undefined) set('dropout_subsheet', String(body.dropout_subsheet).trim() || null);
    if (body.auto_sync_enabled !== undefined) set('auto_sync_enabled', !!body.auto_sync_enabled);
    if (body.auto_sync_interval_minutes !== undefined) set('auto_sync_interval_minutes', Number(body.auto_sync_interval_minutes) || 30);
    if (body.status !== undefined) {
        const s = String(body.status);
        if (s !== 'active' && s !== 'archived') throw error(400, 'status must be active or archived');
        set('status', s);
    }
    if (fields.length === 0) return json({ ok: true, noop: true });

    fields.push(`updated_at = now()`);
    const r = await db.query(
        `UPDATE fee_semester_window SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
        args,
    );
    if (r.rowCount === 0) throw error(404, 'Window not found');
    return json({ window: r.rows[0] });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    checkFeeAccess(locals, 'admin');
    if (!params.id) throw error(400, 'id required');
    await db.query(
        `UPDATE fee_semester_window SET status = 'archived', updated_at = now() WHERE id = $1`,
        [params.id],
    );
    return json({ ok: true });
};
