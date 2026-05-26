/**
 * Operations drill-down — server load.
 *
 * Fetches submission + values + events + campus name in one server-side
 * roundtrip so the read-only view renders fully populated.
 */
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
    withReadOnlyUserContext,
    getSubmissionById,
    getSubmissionValues,
    getSubmissionEvents,
    type Submission,
    type SubmissionValueRow,
    type SubmissionEventRow,
} from '@uniconnect/shared';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    const role = locals.user.role as string;
    if (!['ADMIN', 'PROGRAM_OPS', 'COS', 'PM', 'PMA'].includes(role)) {
        throw error(403, 'Operations drill-down is for COS, PM, PMA, PROGRAM_OPS, or ADMIN');
    }
    if (!params.id) throw error(400, 'submission id required');
    const userId = locals.user.id as string;

    const result = await withReadOnlyUserContext(userId, role, async (client) => {
        const submission = await getSubmissionById(params.id, client);
        if (!submission) return null;

        const [values, events, campusRow] = await Promise.all([
            getSubmissionValues(params.id, client),
            getSubmissionEvents(params.id, client),
            client.query<{ display_name: string; code: string }>(
                `SELECT display_name, code FROM ops_os.campus_dim WHERE campus_id = $1`,
                [submission.campus_id],
            ),
        ]);

        return {
            submission,
            values,
            events,
            campus: campusRow.rows[0] ?? null,
        };
    });

    if (!result) throw error(404, 'submission not found or out of scope');

    return {
        submission_id: params.id,
        role,
        submission: result.submission as Submission,
        values: result.values as SubmissionValueRow[],
        events: result.events as SubmissionEventRow[],
        campus: result.campus as { display_name: string; code: string } | null,
    };
};
