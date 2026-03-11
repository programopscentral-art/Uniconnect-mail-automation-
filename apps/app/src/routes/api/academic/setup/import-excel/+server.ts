import * as XLSX from 'xlsx';
import { processBulkImport, type ImportPayload } from '$lib/server/bulk-import-processor';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

function getRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
    // Skip header row, skip fully-empty rows
    return aoa.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));
}

function str(v: any): string { return String(v ?? '').trim(); }
function num(v: any, def: number): number { const n = Number(v); return isNaN(n) || n === 0 ? def : n; }

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const universityId = formData.get('university_id') as string | null;

    if (!file) throw error(400, 'No file uploaded');
    if (!universityId) throw error(400, 'university_id is required');

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    const payload: ImportPayload = {
        university_id: universityId,

        campuses: getRows(wb, 'Campuses')
            .map(r => ({ name: str(r[0]), code: str(r[1]), address: str(r[2]) || undefined }))
            .filter(c => c.name && c.code),

        programs: getRows(wb, 'Programs')
            .map(r => ({
                name: str(r[0]),
                code: str(r[1]),
                degree_type: str(r[2]) || 'B.Tech',
                semester_count: num(r[3], 8),
                campus_code: str(r[4]) || undefined
            }))
            .filter(p => p.name && p.code),

        terms: getRows(wb, 'Terms')
            .map(r => ({ program_code: str(r[0]), name: str(r[1]), start_date: str(r[2]), end_date: str(r[3]) }))
            .filter(t => t.program_code && t.name && t.start_date && t.end_date),

        sections: getRows(wb, 'Sections')
            .map(r => ({
                program_code: str(r[0]),
                term_name: str(r[1]),
                name: str(r[2]),
                batch_code: str(r[3]),
                strength: num(r[4], 60)
            }))
            .filter(s => s.program_code && s.term_name && s.name && s.batch_code),

        subjects: getRows(wb, 'Subjects')
            .map(r => ({
                program_code: str(r[0]),
                term_name: str(r[1]),
                name: str(r[2]),
                code: str(r[3]),
                credit_value: num(r[4], 4),
                total_sessions: num(r[5], 30)
            }))
            .filter(s => s.program_code && s.term_name && s.name)
    };

    const result = await processBulkImport(payload);
    const totalCreated = Object.values(result.created).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);

    return json({
        success: result.errors.length === 0,
        summary: `${totalCreated} created, ${totalSkipped} skipped, ${result.errors.length} errors`,
        ...result
    });
};
