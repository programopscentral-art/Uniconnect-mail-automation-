/**
 * POST /api/assessments/papers/[id]/drive-upload
 *   multipart/form-data: file=<pdf blob>, set=<A|B|C|D>
 *
 * Uploads a client-rendered exam-paper PDF into the paper's Drive folder
 * (<Uni> University / <Uni> <Batch> Batch / <Uni> Semester N Graded Assessments).
 * Used by the editor's Save flow — the paper is rendered to PDF in the browser
 * (works for every paper format, not just deterministic templates) and posted
 * here for routing + upload.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadPaperPdf } from '$lib/server/exam_drive';

const MAX = 25 * 1024 * 1024; // 25 MB safety cap

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    if (!params.id) throw error(400, 'id required');

    const form = await request.formData();
    const file = form.get('file');
    const set = String(form.get('set') || 'A').trim() || 'A';
    const kind = String(form.get('kind') || 'paper') === 'answer_key' ? 'answer_key' : 'paper';
    if (!(file instanceof File)) throw error(400, 'file (pdf) is required');
    if (file.size > MAX) throw error(400, 'PDF exceeds 25 MB');

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await uploadPaperPdf(params.id, set, buf, kind as 'paper' | 'answer_key');
    return json(result);
};
