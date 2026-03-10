import * as XLSX from 'xlsx';
import { AcademicService } from '@uniconnect/shared';
import { StudentService } from '@uniconnect/shared';
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
    const termName = (formData.get('term_name') as string | null)?.trim() || '';

    if (!file) throw error(400, 'No file uploaded');
    if (!universityId) throw error(400, 'university_id is required');
    if (!termName) throw error(400, 'term_name is required (e.g. "Semester 2 - 2026")');

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    // Load all programs for this university (code → id)
    const allPrograms = await AcademicService.getPrograms(universityId);
    const programCodeToId = new Map<string, string>(
        allPrograms.map((p: any) => [p.code.toUpperCase(), p.id])
    );

    const result = {
        sheets_processed: 0,
        created: 0,
        skipped: 0,
        failed: 0,
        errors: [] as { sheet: string; row?: number; reason: string }[]
    };

    for (const sheetName of wb.SheetNames) {
        const programCode = sheetName.trim().toUpperCase();
        const programId = programCodeToId.get(programCode);

        if (!programId) {
            result.errors.push({ sheet: sheetName, reason: `Program code "${programCode}" not found for this university` });
            continue;
        }

        // Find the term matching termName under this program
        const terms = await AcademicService.getTerms(programId);
        const term = terms.find((t: any) => t.name.toLowerCase() === termName.toLowerCase());
        if (!term) {
            result.errors.push({ sheet: sheetName, reason: `Term "${termName}" not found under program "${programCode}"` });
            continue;
        }

        // Find or use first section for this term
        const sections = await AcademicService.getSections(term.id);
        const sectionId = sections[0]?.id || null;
        if (!sectionId) {
            result.errors.push({ sheet: sheetName, reason: `No section found for term "${termName}" under program "${programCode}". Create at least one section first.` });
            continue;
        }

        // Parse sheet rows — find header row first
        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
        if (aoa.length < 2) { result.sheets_processed++; continue; }

        // Map header names to column indexes (case-insensitive)
        const headers = (aoa[0] as any[]).map((h: any) => str(h).toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('student name') || h === 'name');
        const idIdx = headers.findIndex(h => h.includes('niat id') || h.includes('enrollment') || h.includes('student id'));
        const emailIdx = headers.findIndex(h => h.includes('mail') || h.includes('email'));

        if (nameIdx === -1 || idIdx === -1) {
            result.errors.push({ sheet: sheetName, reason: 'Could not find "Student Name" or "NIAT ID" columns in header row' });
            continue;
        }

        const students = aoa.slice(1)
            .filter(row => row.some((cell: any) => str(cell) !== ''))
            .map((row, i) => ({
                name: str(row[nameIdx]),
                enrollment_number: str(row[idIdx]),
                email: emailIdx !== -1 ? str(row[emailIdx]) : '',
                _row: i + 2
            }))
            .filter(s => s.name && s.enrollment_number);

        if (students.length === 0) { result.sheets_processed++; continue; }

        const importResult = await StudentService.importStudents(
            universityId, programId, term.id, sectionId, students
        );

        result.sheets_processed++;
        result.created += importResult.success;
        result.failed += importResult.failed;
        for (const e of importResult.errors) {
            result.errors.push({ sheet: sheetName, reason: e });
        }
    }

    return json({
        success: result.failed === 0 && result.errors.filter(e => !e.reason.includes('not found')).length === 0,
        summary: `${result.sheets_processed} programs processed — ${result.created} students imported, ${result.failed} failed`,
        ...result
    });
};
