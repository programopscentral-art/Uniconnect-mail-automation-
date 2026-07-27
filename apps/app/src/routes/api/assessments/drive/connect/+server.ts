/**
 * GET /api/assessments/drive/connect
 *   → Start the Google OAuth flow to connect the exam-papers Drive.
 *     Admin-only. Must be authorised by the Drive folder owner
 *     (programopscentral@nxtwave.in) so uploads land in that account.
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExamDriveAuthUrl } from '$lib/server/exam_drive';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Only admins can connect the exam-papers Drive.');
    }
    throw redirect(302, getExamDriveAuthUrl(locals.user.id));
};
