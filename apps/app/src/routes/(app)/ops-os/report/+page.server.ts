/**
 * BOA daily report page — server load.
 *
 * Loads everything the page needs in one server-side DB roundtrip so the
 * form renders immediately on navigation (no client "Loading draft…").
 *
 * Flow:
 *   1. Auth gate (BOA / PROGRAM_OPS / ADMIN).
 *   2. Resolve caller's campus list.
 *   3. Pick the active campus from ?campus=<id> (or default to first).
 *   4. Find-or-create the DAILY draft for that campus + today.
 *   5. Load existing values for that draft.
 *
 * Campus dropdown updates the URL via goto(), which re-invokes this load —
 * no client-side fetch waterfall.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    withUserContext,
    findCurrentSubmission,
    createSubmission,
    getSubmissionValues,
    type Submission,
} from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'BOA'].includes(role)) {
        throw error(403, 'BOA daily report is available to BOA, PROGRAM_OPS, or ADMIN roles only');
    }

    const userId = locals.user.id as string;
    const today = new Date().toISOString().slice(0, 10);

    const campuses = await withReadOnlyUserContext(userId, role, async (client) => {
        const r = await client.query<{ campus_id: string; code: string; display_name: string }>(
            `SELECT c.campus_id, c.code, c.display_name
             FROM ops_os.campus_dim c
             JOIN ops_os.user_campus_assignment uca
                  ON uca.campus_id = c.campus_id
                 AND uca.user_id = $1
                 AND uca.role = 'BOA'
                 AND uca.revoked_at IS NULL
             WHERE c.status = 'active'
             ORDER BY c.display_name`,
            [userId],
        );
        if (r.rows.length === 0 && (role === 'ADMIN' || role === 'PROGRAM_OPS')) {
            const all = await client.query<{ campus_id: string; code: string; display_name: string }>(
                `SELECT campus_id, code, display_name FROM ops_os.campus_dim
                 WHERE status = 'active'
                 ORDER BY display_name`,
            );
            return all.rows;
        }
        return r.rows;
    });

    const requestedCampus = url.searchParams.get('campus') ?? '';
    const activeCampusId = campuses.find(c => c.campus_id === requestedCampus)?.campus_id
        ?? campuses[0]?.campus_id
        ?? '';

    let submission: Submission | null = null;
    let values: Array<{
        metric_id: string;
        value_numeric: number | null;
        value_text: string | null;
        value_boolean: boolean | null;
    }> = [];

    if (activeCampusId) {
        const draft = await withUserContext(userId, role, async (client) => {
            const existing = await findCurrentSubmission(
                { campus_id: activeCampusId, cadence: 'DAILY', period_start: today, period_end: today },
                client,
            );
            if (existing) return existing;
            try {
                return await createSubmission(
                    { campus_id: activeCampusId, cadence: 'DAILY', period_start: today, period_end: today, created_by: userId },
                    client,
                );
            } catch (e: unknown) {
                // Race: another concurrent load created it. Re-find.
                const again = await findCurrentSubmission(
                    { campus_id: activeCampusId, cadence: 'DAILY', period_start: today, period_end: today },
                    client,
                );
                if (again) return again;
                throw e;
            }
        });
        submission = draft;

        const rawValues = await withReadOnlyUserContext(userId, role, async (client) => {
            return getSubmissionValues(draft.submission_id, client);
        });
        values = rawValues.map(v => ({
            metric_id: v.metric_id,
            value_numeric: v.value_numeric,
            value_text: v.value_text,
            value_boolean: v.value_boolean,
        }));
    }

    return {
        campuses,
        today,
        role,
        activeCampusId,
        submission,
        values,
    };
};
