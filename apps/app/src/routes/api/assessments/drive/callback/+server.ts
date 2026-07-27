/**
 * GET /api/assessments/drive/callback
 *   → OAuth callback: exchange the code for tokens and store the encrypted
 *     refresh token as the shared exam-papers Drive connection.
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveExamDriveTokens } from '$lib/server/exam_drive';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Please log in again');
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Only admins can connect the exam-papers Drive.');
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) throw error(400, 'Missing authorization code');
    if (state !== locals.user.id) throw error(403, 'State mismatch — please retry from the Connect button.');

    try {
        const { email } = await saveExamDriveTokens(code, locals.user.id);
        console.log(`[EXAM_DRIVE] Connected exam-papers Drive as ${email} by user ${locals.user.id}`);
    } catch (err: any) {
        if (err.status && err.status >= 300 && err.status < 500) throw err;
        console.error('[EXAM_DRIVE] callback error:', err.message);
        throw error(500, `Failed to connect Drive: ${err.message}`);
    }
    throw redirect(302, '/assessments?drive=connected');
};
