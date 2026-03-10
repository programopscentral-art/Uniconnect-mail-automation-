import * as XLSX from 'xlsx';
import { FacultyService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function str(v: any): string { return String(v ?? '').trim(); }

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

    // Use first sheet (or a sheet named "Faculty")
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('faculty')) ?? wb.SheetNames[0];
    if (!sheetName) throw error(400, 'No sheets found in the uploaded file');

    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
    if (aoa.length < 2) {
        return json({ success: true, summary: 'No data rows found', created: 0, failed: 0, errors: [] });
    }

    // Map header names to column indexes (case-insensitive, flexible matching)
    const headers = (aoa[0] as any[]).map((h: any) => str(h).toLowerCase());
    const nameIdx    = headers.findIndex(h => h.includes('faculty list') || h.includes('faculty name') || h === 'name');
    const codeIdx    = headers.findIndex(h => h === 'id' || h.includes('employee') || h.includes('faculty id'));
    const emailIdx   = headers.findIndex(h => h.includes('mail') || h.includes('email'));
    const phoneIdx   = headers.findIndex(h => h.includes('number') || h.includes('phone') || h.includes('mobile'));
    const subjectIdx = headers.findIndex(h => h.includes('subject'));

    if (nameIdx === -1) throw error(400, 'Could not find "Faculty List" column. Expected header: "Faculty List"');
    if (codeIdx === -1) throw error(400, 'Could not find "ID" column. Expected header: "ID"');

    const facultyList = aoa.slice(1)
        .filter(row => row.some((cell: any) => str(cell) !== ''))
        .map(row => {
            const rawSubjects = subjectIdx !== -1 ? str(row[subjectIdx]) : '';
            const subject_codes = rawSubjects
                ? rawSubjects.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
                : [];
            return {
                name: str(row[nameIdx]),
                employee_code: str(row[codeIdx]),
                email: emailIdx !== -1 ? str(row[emailIdx]) : '',
                phone: phoneIdx !== -1 ? str(row[phoneIdx]) : '',
                subject_codes
            };
        })
        .filter(f => f.name && f.employee_code);

    if (facultyList.length === 0) {
        return json({ success: true, summary: 'No valid faculty rows found', created: 0, failed: 0, errors: [] });
    }

    const importResult = await FacultyService.importFaculty(universityId, facultyList);

    return json({
        success: importResult.failed === 0,
        summary: `${importResult.success} faculty imported, ${importResult.failed} failed`,
        created: importResult.success,
        failed: importResult.failed,
        errors: importResult.errors
    });
};
