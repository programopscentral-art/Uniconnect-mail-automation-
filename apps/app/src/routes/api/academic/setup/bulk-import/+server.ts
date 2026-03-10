import { processBulkImport, type ImportPayload } from '$lib/server/bulk-import-processor';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const payload: ImportPayload = await request.json();
    if (!payload.university_id) throw error(400, 'university_id is required');

    const result = await processBulkImport(payload);
    const totalCreated = Object.values(result.created).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);

    return json({
        success: result.errors.length === 0,
        summary: `${totalCreated} created, ${totalSkipped} skipped, ${result.errors.length} errors`,
        ...result
    });
};
