import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExtractionEngine } from '$lib/server/services/extraction-engine';
import pdf from 'pdf-img-convert';

const engine = new ExtractionEngine();

export const POST: RequestHandler = async ({ request }) => {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return json({ error: 'No file uploaded' }, { status: 400 });
        }

        let buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = file.type;

        console.log(`[API_ANALYZE] Received file: ${file.name} (${mimeType})`);

        // Handle PDF conversion
        if (mimeType === 'application/pdf') {
            const pdfArray = await pdf.convert(buffer, { page_numbers: [1] });
            buffer = Buffer.from(pdfArray[0]);
            console.log(`[API_ANALYZE] PDF converted to PNG (Page 1)`);
        }

        const blueprint = await engine.analyze(buffer, mimeType);

        return json(blueprint);
    } catch (error: any) {
        console.error('[API_ANALYZE] Fatal Error:', error);
        return json({
            error: error.message || 'Internal analysis error',
            details: error.stack
        }, { status: 500 });
    }
};
