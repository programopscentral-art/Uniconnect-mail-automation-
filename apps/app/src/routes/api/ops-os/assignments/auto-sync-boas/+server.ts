/**
 * POST /api/ops-os/assignments/auto-sync-boas
 *
 * ADMIN / PROGRAM_OPS only. Runs the BOA auto-assignment sync immediately,
 * granting every active BOA user a user_campus_assignment row for every
 * active campus in their university. Idempotent.
 *
 * Returns { boas_scanned, rows_inserted, skipped_revoked }.
 * - boas_scanned: total active BOAs in the system
 * - rows_inserted: NEW assignment rows created on this call
 * - skipped_revoked: pairs that were previously soft-revoked and so were
 *                    intentionally NOT resurrected (admins must re-grant
 *                    these explicitly via the per-campus panel below).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBoaCampusAssignments } from '@uniconnect/shared';
import { checkOpsOsAccess } from '$lib/server/ops_os/access';

export const POST: RequestHandler = async ({ locals }) => {
    checkOpsOsAccess(locals, 'admin');
    const result = await ensureBoaCampusAssignments();
    return json({ ok: true, ...result });
};
