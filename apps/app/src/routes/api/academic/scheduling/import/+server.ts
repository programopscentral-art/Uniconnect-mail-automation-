import { parseTimetableExcel } from '@uniconnect/shared';
import { matchParsedSessions } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — upload and parse timetable Excel, return match analysis
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const universityId = formData.get('universityId') as string;
    const year = formData.get('year') as string;

    if (!file || !universityId) {
        throw error(400, 'file and universityId are required');
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parseResult = await parseTimetableExcel(buffer, year ? parseInt(year) : undefined);

        if (parseResult.sessions.length === 0) {
            // Debug: show what was found in each sheet to help diagnose format issues
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const debugSheets: any[] = [];
            for (const sn of workbook.SheetNames.slice(0, 5)) {
                const ws = workbook.Sheets[sn];
                if (!ws) continue;
                const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
                const preview = rows.slice(0, 6).map((r, i) => ({
                    row: i,
                    cells: r.slice(0, 8).map((c: any) => ({ value: String(c || '').substring(0, 50), type: typeof c }))
                }));
                debugSheets.push({ name: sn, rowCount: rows.length, preview });
            }
            return json({
                success: false,
                message: `No sessions found. Sheets: ${workbook.SheetNames.length}. Errors: ${parseResult.errors.join('; ') || 'none'}. Warnings: ${parseResult.warnings.join('; ') || 'none'}`,
                parseResult: { ...parseResult, sessions: [] },
                debugSheets
            });
        }

        // Match against DB
        const matchResult = await matchParsedSessions(universityId, parseResult.sessions);

        return json({
            success: true,
            parseResult: {
                sheets: parseResult.sheets,
                slots: parseResult.slots,
                errors: parseResult.errors,
                warnings: parseResult.warnings,
                totalSessions: parseResult.sessions.length
            },
            matchResult: {
                subjects: matchResult.subjects,
                faculty: matchResult.faculty,
                sections: matchResult.sections,
                unmatchedSubjects: matchResult.unmatchedSubjects,
                unmatchedFaculty: matchResult.unmatchedFaculty,
                unmatchedSections: matchResult.unmatchedSections,
                warnings: matchResult.warnings,
                totalParsed: matchResult.totalParsed,
                totalMatchable: matchResult.totalMatchable,
                // Send matched sessions so frontend can display and user can fix mappings
                matchedSessions: matchResult.matchedSessions
            }
        });
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/import]', e);
        return json({ success: false, message: e.message || 'Failed to parse file' }, { status: 500 });
    }
};
