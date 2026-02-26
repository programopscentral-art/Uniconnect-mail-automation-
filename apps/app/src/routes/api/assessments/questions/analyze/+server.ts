import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRequire } from 'module';

type XLSXModule = {
    read: (data: Buffer, options: { type: 'buffer' }) => any;
    utils: {
        sheet_to_json: <T>(sheet: any, options: { header: 1 }) => T;
    };
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const require = createRequire(import.meta.url);
    const XLSX = require('xlsx') as XLSXModule;
    if (!locals.user) throw error(401);

    let file: File | null = null;
    try {
        const formData = await request.formData();
        file = formData.get('file') as File;
        const sheetName = formData.get('sheetName') as string;

        if (!file) throw error(400, 'No file uploaded');

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        const sheetNames = workbook.SheetNames as string[];
        const targetSheet = sheetName || sheetNames[0];
        const sheet = workbook.Sheets[targetSheet];

        if (!sheet) {
            return json({ sheetNames, headers: [], previewRows: [] });
        }

        const rawData = XLSX.utils.sheet_to_json<any[][]>(sheet, { header: 1 });
        const jsonData = rawData.filter((row: any) => row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== ''));

        let headers: string[] = [];
        let previewRows: any[] = [];

        if (jsonData.length > 0) {
            headers = (jsonData[0] as string[]) || [];
            previewRows = jsonData.slice(1, 6);
        }

        return json({ sheetNames, headers, previewRows });
    } catch (err: any) {
        console.error('CRITICAL_EXCEL_ANALYSIS_ERROR:', {
            message: err.message,
            stack: err.stack,
            fileName: file?.name,
            fileSize: file?.size
        });

        const isLikelyCorrupt = err.message?.toLowerCase().includes('password') ||
            err.message?.toLowerCase().includes('corrupt') ||
            err.message?.toLowerCase().includes('zip');

        throw error(500, isLikelyCorrupt
            ? 'The Excel file appears to be corrupted or password-protected. Please save it as a fresh .xlsx file and try again.'
            : `Analysis Error: ${err.message || 'Unknown internal error'}`);
    }
};
