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

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
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
        console.error('Excel Analysis Error:', err);
        throw error(500, err.message || 'Failed to analyze Excel file');
    }
};
