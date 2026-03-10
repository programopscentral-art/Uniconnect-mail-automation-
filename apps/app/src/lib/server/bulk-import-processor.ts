import { AcademicService } from '@uniconnect/shared';

export interface ImportPayload {
    university_id: string;
    campuses?: { name: string; code: string; address?: string }[];
    programs?: { name: string; code: string; degree_type?: string; semester_count?: number; campus_code?: string }[];
    terms?: { program_code: string; name: string; start_date: string; end_date: string }[];
    sections?: { program_code: string; term_name: string; name: string; batch_code: string; strength?: number }[];
    subjects?: { program_code: string; term_name: string; name: string; code: string; credit_value?: number; total_sessions?: number }[];
}

export interface ImportResult {
    created: Record<string, number>;
    skipped: Record<string, number>;
    errors: { entity: string; item: string; reason: string }[];
}

export async function processBulkImport(payload: ImportPayload): Promise<ImportResult> {
    const result: ImportResult = {
        created: { campuses: 0, programs: 0, terms: 0, sections: 0, subjects: 0 },
        skipped: { campuses: 0, programs: 0, terms: 0, sections: 0, subjects: 0 },
        errors: []
    };

    const campusCodeToId = new Map<string, string>();
    const programCodeToId = new Map<string, string>();
    const termKeyToId = new Map<string, string>(); // "PROGRAM_CODE|term name lowercase"

    // Seed maps with existing data
    const existingCampuses = await AcademicService.getCampuses(payload.university_id).catch(() => []);
    for (const c of existingCampuses) campusCodeToId.set(c.code.toUpperCase(), c.id);

    const existingPrograms = await AcademicService.getPrograms(payload.university_id).catch(() => []);
    for (const p of existingPrograms) programCodeToId.set(p.code.toUpperCase(), p.id);

    // 1. Campuses
    for (const camp of payload.campuses ?? []) {
        if (!camp.name || !camp.code) {
            result.errors.push({ entity: 'campus', item: camp.name || '?', reason: 'name and code are required' });
            continue;
        }
        const key = camp.code.toUpperCase();
        if (campusCodeToId.has(key)) { result.skipped.campuses++; continue; }
        try {
            const created = await AcademicService.createCampus({
                university_id: payload.university_id,
                name: camp.name,
                code: key,
                address: camp.address,
                status: 'ACTIVE'
            });
            campusCodeToId.set(key, created.id);
            result.created.campuses++;
        } catch (e: any) {
            result.errors.push({ entity: 'campus', item: camp.code, reason: e?.message || 'create failed' });
        }
    }

    // 2. Programs
    for (const prog of payload.programs ?? []) {
        if (!prog.name || !prog.code) {
            result.errors.push({ entity: 'program', item: prog.name || '?', reason: 'name and code are required' });
            continue;
        }
        const key = prog.code.toUpperCase();
        if (programCodeToId.has(key)) { result.skipped.programs++; continue; }
        try {
            const campusId = prog.campus_code ? campusCodeToId.get(prog.campus_code.toUpperCase()) : undefined;
            const created = await AcademicService.createProgram({
                university_id: payload.university_id,
                campus_id: campusId,
                name: prog.name,
                code: key,
                degree_type: prog.degree_type || 'B.Tech',
                semester_count: prog.semester_count || 8,
                status: 'ACTIVE'
            });
            programCodeToId.set(key, created.id);
            result.created.programs++;
        } catch (e: any) {
            result.errors.push({ entity: 'program', item: prog.code, reason: e?.message || 'create failed' });
        }
    }

    // 3. Terms
    for (const term of payload.terms ?? []) {
        if (!term.program_code || !term.name || !term.start_date || !term.end_date) {
            result.errors.push({ entity: 'term', item: term.name || '?', reason: 'program_code, name, start_date, end_date are required' });
            continue;
        }
        const programId = programCodeToId.get(term.program_code.toUpperCase());
        if (!programId) {
            result.errors.push({ entity: 'term', item: term.name, reason: `program_code "${term.program_code}" not found` });
            continue;
        }
        try {
            const existing = await AcademicService.getTerms(programId);
            const duplicate = existing.find((t: any) => t.name.toLowerCase() === term.name.toLowerCase());
            if (duplicate) {
                termKeyToId.set(`${term.program_code.toUpperCase()}|${term.name.toLowerCase()}`, duplicate.id);
                result.skipped.terms++;
                continue;
            }
            const created = await AcademicService.createTerm(payload.university_id, programId, {
                name: term.name,
                start_date: new Date(term.start_date),
                end_date: new Date(term.end_date)
            });
            termKeyToId.set(`${term.program_code.toUpperCase()}|${term.name.toLowerCase()}`, created.id);
            result.created.terms++;
        } catch (e: any) {
            result.errors.push({ entity: 'term', item: term.name, reason: e?.message || 'create failed' });
        }
    }

    // 4. Sections
    for (const sec of payload.sections ?? []) {
        if (!sec.program_code || !sec.term_name || !sec.name || !sec.batch_code) {
            result.errors.push({ entity: 'section', item: sec.name || '?', reason: 'program_code, term_name, name, batch_code are required' });
            continue;
        }
        const programId = programCodeToId.get(sec.program_code.toUpperCase());
        const termId = termKeyToId.get(`${sec.program_code.toUpperCase()}|${sec.term_name.toLowerCase()}`);
        if (!programId) {
            result.errors.push({ entity: 'section', item: sec.name, reason: `program_code "${sec.program_code}" not found` });
            continue;
        }
        if (!termId) {
            result.errors.push({ entity: 'section', item: sec.name, reason: `term "${sec.term_name}" not found under program "${sec.program_code}"` });
            continue;
        }
        try {
            const existing = await AcademicService.getSections(termId);
            const duplicate = existing.find((s: any) => s.batch_code?.toLowerCase() === sec.batch_code.toLowerCase());
            if (duplicate) { result.skipped.sections++; continue; }
            await AcademicService.createSection(payload.university_id, programId, termId, {
                name: sec.name,
                batch_code: sec.batch_code,
                strength: sec.strength || 60
            });
            result.created.sections++;
        } catch (e: any) {
            result.errors.push({ entity: 'section', item: sec.name, reason: e?.message || 'create failed' });
        }
    }

    // 5. Subjects
    for (const sub of payload.subjects ?? []) {
        if (!sub.program_code || !sub.term_name || !sub.name || !sub.code) {
            result.errors.push({ entity: 'subject', item: sub.name || '?', reason: 'program_code, term_name, name, code are required' });
            continue;
        }
        const programId = programCodeToId.get(sub.program_code.toUpperCase());
        const termId = termKeyToId.get(`${sub.program_code.toUpperCase()}|${sub.term_name.toLowerCase()}`);
        if (!programId) {
            result.errors.push({ entity: 'subject', item: sub.name, reason: `program_code "${sub.program_code}" not found` });
            continue;
        }
        if (!termId) {
            result.errors.push({ entity: 'subject', item: sub.name, reason: `term "${sub.term_name}" not found under program "${sub.program_code}"` });
            continue;
        }
        try {
            const existing = await AcademicService.getSubjects(termId);
            const duplicate = existing.find((s: any) => s.code?.toLowerCase() === sub.code.toLowerCase());
            if (duplicate) { result.skipped.subjects++; continue; }
            await AcademicService.createSubject(payload.university_id, programId, termId, {
                name: sub.name,
                code: sub.code.toUpperCase(),
                credit_value: sub.credit_value || 4,
                total_sessions: sub.total_sessions || 30
            });
            result.created.subjects++;
        } catch (e: any) {
            result.errors.push({ entity: 'subject', item: sub.name, reason: e?.message || 'create failed' });
        }
    }

    return result;
}
