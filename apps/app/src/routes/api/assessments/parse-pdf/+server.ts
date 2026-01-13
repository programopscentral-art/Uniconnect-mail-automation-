import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            throw error(400, 'No file uploaded');
        }

        let text = '';
        const buffer = Buffer.from(await file.arrayBuffer());

        if (file.name.toLowerCase().endsWith('.pdf')) {
            const PDFParse = typeof pdf === 'function' ? pdf : pdf.PDFParse;
            if (typeof PDFParse !== 'function') {
                throw error(500, 'PDF Parser library not found or incorrectly loaded');
            }
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            text = result.text;
        } else if (file.name.toLowerCase().endsWith('.docx')) {
            const extractor = (mammoth as any).extractRawText || ((mammoth as any).default && (mammoth as any).default.extractRawText);
            if (!extractor) throw error(500, 'DOCX Parser library not found or incorrectly loaded');
            const result = await extractor({ buffer });
            text = result.value;
        } else if (file.name.toLowerCase().endsWith('.doc')) {
            throw error(400, 'Legacy .doc format is not supported. Please save as .docx or .pdf');
        } else {
            throw error(400, 'Unsupported file format. Please upload PDF or DOCX.');
        }

        return json({ text });
    } catch (err: any) {
        console.error('File Parse Error:', err);
        throw error(500, err.message || 'Failed to parse file');
    }
};
