/**
 * GET /api/assessments/drive/status
 *   → Whether the exam-papers Drive is connected (for the editor UI to show a
 *     "Connect Drive" button vs a connected badge).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExamDriveStatus } from '$lib/server/exam_drive';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    return json(await getExamDriveStatus());
};
