import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importQuestionBank } from '$lib/server/question_import';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const unitId = formData.get('unitId') as string;
        const subjectId = formData.get('subjectId') as string;
        const mode = (formData.get('mode') as string) || 'normal';
        const sheetName = formData.get('sheetName') as string;

        if (!file || !unitId || !subjectId) {
            throw error(400, 'File, Unit ID, and Subject ID are required');
        }

        const { count } = await importQuestionBank({
            fileName: file.name,
            arrayBuffer: await file.arrayBuffer(),
            unitId,
            subjectId,
            mode,
            sheetName,
        });

        return json({ status: 'success', count });
    } catch (err: any) {
        console.error('Upload Error:', err);
        throw error(err?.status || 500, err.message || 'Failed to process import');
    }
};
