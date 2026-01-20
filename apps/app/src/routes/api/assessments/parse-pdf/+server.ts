import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRequire } from 'module';
import mammoth from 'mammoth';

// Define types for dynamically imported modules
type PDFParseModule = {
    (data: { data: Buffer }): Promise<{ text: string }>;
    PDFParse: (data: { data: Buffer }) => Promise<{ text: string }>;
};

type XLSXModule = {
    read: (data: Buffer, options: { type: 'buffer' }) => any; // Simplified type for workbook
    utils: {
        sheet_to_json: <T>(sheet: any, options: { header: 1 }) => T;
    };
    // Add other properties if needed
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const require = createRequire(import.meta.url);
    const pdf = require('pdf-parse') as PDFParseModule;
    const XLSX = require('xlsx') as XLSXModule; // Moved and typed
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
            const result = await pdf({ data: buffer });
            text = result.text;
        } else if (file.name.toLowerCase().endsWith('.docx')) {
            const extractor = (mammoth as any).extractRawText || ((mammoth as any).default && (mammoth as any).default.extractRawText);
            if (!extractor) throw error(500, 'DOCX Parser library not found or incorrectly loaded');
            const result = await extractor({ buffer });
            text = result.value;
        } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let allText = '';
            for (const sName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sName];
                const rows = XLSX.utils.sheet_to_json<any[][]>(sheet, { header: 1 });
                for (const row of rows) {
                    allText += row.filter((c: any) => c !== null && c !== '').join(' ') + '\n';
                }
            }
            text = allText;
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
