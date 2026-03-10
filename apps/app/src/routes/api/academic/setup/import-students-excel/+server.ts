import * as XLSX from 'xlsx';
import { db, AcademicService, StudentService } from '@uniconnect/shared';
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

    // Load all programs, terms, sections for this university in parallel (3 queries total)
    const [allPrograms, allTermsRes, allSectionsRes] = await Promise.all([
        AcademicService.getPrograms(universityId),
        db.query(
            `SELECT t.id, t.name, t.program_id FROM terms t
             JOIN programs p ON p.id = t.program_id
             WHERE p.university_id = $1 AND t.is_active = true`,
            [universityId]
        ),
        db.query(
            `SELECT s.id, s.term_id FROM sections s
             JOIN terms t ON t.id = s.term_id
             JOIN programs p ON p.id = t.program_id
             WHERE p.university_id = $1 AND s.is_active = true
             ORDER BY s.name ASC`,
            [universityId]
        )
    ]);

    const programCodeToId = new Map<string, string>(
        allPrograms.map((p: any) => [p.code.toUpperCase(), p.id])
    );
    // programId → term matching termName
    const programToTermId = new Map<string, string>();
    for (const t of allTermsRes.rows) {
        if (t.name.toLowerCase() === termName.toLowerCase()) {
            programToTermId.set(t.program_id, t.id);
        }
    }
    // termId → first sectionId
    const termToSectionId = new Map<string, string>();
    for (const s of allSectionsRes.rows) {
        if (!termToSectionId.has(s.term_id)) termToSectionId.set(s.term_id, s.id);
    }

    const result = {
        sheets_processed: 0,
        created: 0,
        failed: 0,
        errors: [] as { sheet: string; reason: string }[]
    };

    // Parse all sheets into jobs first, then run imports in parallel
    const jobs: { sheetName: string; programId: string; termId: string; sectionId: string; students: any[] }[] = [];

    for (const sheetName of wb.SheetNames) {
        const programCode = sheetName.trim().toUpperCase();
        const programId = programCodeToId.get(programCode);
        if (!programId) {
            result.errors.push({ sheet: sheetName, reason: `Program code "${programCode}" not found` });
            continue;
        }
        const termId = programToTermId.get(programId);
        if (!termId) {
            result.errors.push({ sheet: sheetName, reason: `Term "${termName}" not found under program "${programCode}"` });
            continue;
        }
        const sectionId = termToSectionId.get(termId);
        if (!sectionId) {
            result.errors.push({ sheet: sheetName, reason: `No section under "${termName}" for "${programCode}" — create one first` });
            continue;
        }

        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
        if (aoa.length < 2) continue;

        const headers = (aoa[0] as any[]).map((h: any) => str(h).toLowerCase());
        const nameIdx  = headers.findIndex(h => h.includes('student name') || h === 'name');
        const idIdx    = headers.findIndex(h => h.includes('niat id') || h.includes('enrollment') || h.includes('student id'));
        const emailIdx = headers.findIndex(h => h.includes('mail') || h.includes('email'));

        if (nameIdx === -1 || idIdx === -1) {
            result.errors.push({ sheet: sheetName, reason: 'Header row must contain "Student Name" and "NIAT ID"' });
            continue;
        }

        const students = aoa.slice(1)
            .filter(row => row.some((cell: any) => str(cell) !== ''))
            .map(row => ({
                name: str(row[nameIdx]),
                enrollment_number: str(row[idIdx]),
                email: emailIdx !== -1 ? str(row[emailIdx]) : ''
            }))
            .filter(s => s.name && s.enrollment_number);

        if (students.length > 0) jobs.push({ sheetName, programId, termId, sectionId, students });
    }

    // Run all program imports in parallel
    const jobResults = await Promise.all(
        jobs.map(async job => {
            const r = await StudentService.importStudents(
                universityId, job.programId, job.termId, job.sectionId, job.students
            );
            return { sheetName: job.sheetName, ...r };
        })
    );

    for (const r of jobResults) {
        result.sheets_processed++;
        result.created += r.success;
        result.failed  += r.failed;
        for (const e of r.errors) result.errors.push({ sheet: r.sheetName, reason: e });
    }

    return json({
        success: result.failed === 0,
        summary: `${result.sheets_processed} programs — ${result.created} students imported, ${result.failed} failed`,
        ...result
    });
};
