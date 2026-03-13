import { SchedulingService, db } from '@uniconnect/shared';
import { toSessionInputs } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — confirm import: create version + bulk insert sessions + track import batch + associate weeks
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const {
        universityId,
        programId,
        termId,
        matchedSessions,
        slots,
        notes,
        fileName,
        fileSizeBytes
    } = await request.json();

    if (!universityId || !matchedSessions || matchedSessions.length === 0) {
        throw error(400, 'universityId and matchedSessions are required');
    }

    try {
        // 1. Upsert university time slots if provided
        if (slots && slots.length > 0) {
            await SchedulingService.upsertSlots(universityId, slots.map((s: any) => ({
                name: s.name,
                start_time: s.startTime || s.start_time,
                end_time: s.endTime || s.end_time,
                slot_type: s.slotType || s.slot_type || 'LECTURE'
            })));
        }

        // 2. Create timetable version
        const version = await SchedulingService.createVersion({
            university_id: universityId,
            program_id: programId || undefined,
            term_id: termId || undefined,
            source_type: 'UPLOAD',
            notes: notes || 'Imported from Excel'
        });

        // 3. Convert matched sessions to input format
        const sessionInputs = toSessionInputs(universityId, programId, termId, matchedSessions);

        // Compute row-level errors (sessions that couldn't be matched)
        const totalParsed = matchedSessions.length;
        const rowsFailed = totalParsed - sessionInputs.length;
        const errorDetails: any[] = [];
        for (const ms of matchedSessions) {
            if (!ms.subjectId || !ms.sectionId) {
                errorDetails.push({
                    date: ms.sessionDate,
                    section: ms.sectionNumber,
                    slot: `${ms.slotStart}-${ms.slotEnd}`,
                    subject: ms.subjectCode,
                    reason: !ms.subjectId ? 'Subject not matched' : 'Section not matched'
                });
            }
        }

        if (sessionInputs.length === 0) {
            return json({
                success: false,
                message: 'No valid sessions to import. Check subject and section mappings.',
                versionId: version.id,
                errorDetails
            });
        }

        // 4. Bulk create sessions
        const created = await SchedulingService.bulkCreateSessions(version.id, sessionInputs);

        // 5. Create import batch record for tracking
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS timetable_import_batches (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                    timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                    timetable_week_id UUID,
                    file_name TEXT NOT NULL,
                    file_size_bytes INTEGER,
                    total_rows_parsed INTEGER DEFAULT 0,
                    rows_matched INTEGER DEFAULT 0,
                    rows_failed INTEGER DEFAULT 0,
                    error_details JSONB DEFAULT '[]'::jsonb,
                    import_status TEXT DEFAULT 'COMPLETED',
                    uploaded_by UUID REFERENCES users(id),
                    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                    processed_at TIMESTAMPTZ DEFAULT NOW(),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            await db.query(
                `INSERT INTO timetable_import_batches
                    (university_id, timetable_version_id, file_name, file_size_bytes,
                     total_rows_parsed, rows_matched, rows_failed, error_details,
                     import_status, uploaded_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9)`,
                [universityId, version.id, fileName || 'unknown.xlsx', fileSizeBytes || 0,
                 totalParsed, sessionInputs.length, rowsFailed,
                 JSON.stringify(errorDetails), locals.user?.id || null]
            );
        } catch (e) {
            console.warn('[import/confirm] Could not create import batch record:', (e as Error).message);
        }

        // 6. Detect week ranges and create timetable_weeks records
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS timetable_weeks (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                    apd_plan_id UUID,
                    timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                    week_start DATE NOT NULL,
                    week_end DATE NOT NULL,
                    week_number INTEGER,
                    week_status TEXT DEFAULT 'DRAFT',
                    generation_source TEXT DEFAULT 'IMPORT',
                    cloned_from_week_id UUID,
                    published_at TIMESTAMPTZ,
                    published_by UUID REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(university_id, week_start, week_end)
                )
            `);

            // Group sessions by week (Mon-Sun)
            const sessionDates = created.map((s: any) => new Date(s.session_date));
            const weekSet = new Map<string, { start: Date; end: Date }>();
            for (const d of sessionDates) {
                const day = d.getDay(); // 0=Sun, 1=Mon...
                const monday = new Date(d);
                monday.setDate(d.getDate() - ((day + 6) % 7));
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                const key = monday.toISOString().split('T')[0];
                if (!weekSet.has(key)) weekSet.set(key, { start: monday, end: sunday });
            }

            let weekNum = 1;
            const sortedWeeks = Array.from(weekSet.entries()).sort(([a], [b]) => a.localeCompare(b));
            for (const [, week] of sortedWeeks) {
                await db.query(
                    `INSERT INTO timetable_weeks (university_id, timetable_version_id, week_start, week_end, week_number, generation_source)
                     VALUES ($1, $2, $3, $4, $5, 'IMPORT')
                     ON CONFLICT (university_id, week_start, week_end) DO UPDATE SET
                        timetable_version_id = $2, updated_at = NOW()`,
                    [universityId, version.id, week.start.toISOString().split('T')[0],
                     week.end.toISOString().split('T')[0], weekNum++]
                );
            }
        } catch (e) {
            console.warn('[import/confirm] Could not create timetable_weeks:', (e as Error).message);
        }

        // 7. Run conflict detection on all created sessions
        let conflictCount = 0;
        for (const session of created) {
            const conflicts = await SchedulingService.detectConflicts({
                university_id: session.university_id,
                program_id: session.program_id,
                term_id: session.term_id,
                section_id: session.section_id,
                subject_id: session.subject_id,
                faculty_profile_id: session.faculty_profile_id,
                classroom_id: session.classroom_id,
                session_date: session.session_date,
                slot_start: session.slot_start,
                slot_end: session.slot_end
            }, session.id);

            for (const c of conflicts) {
                if (c.conflict_type === 'SLOT_VIOLATION') continue;
                try {
                    await db.query(
                        `INSERT INTO scheduling_conflicts
                         (timetable_session_id, university_id, conflict_type, conflict_severity, description, resolution_status)
                         VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
                        [session.id, universityId, c.conflict_type, c.severity, c.description]
                    );
                    conflictCount++;
                } catch { /* ignore duplicate conflicts */ }
            }
        }

        return json({
            success: true,
            versionId: version.id,
            versionNumber: version.version_number,
            sessionsCreated: created.length,
            sessionsSkipped: rowsFailed,
            conflictsDetected: conflictCount,
            errorDetails: errorDetails.length > 0 ? errorDetails : undefined
        });
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/import/confirm]', e);
        return json({ success: false, message: e.message || 'Import failed' }, { status: 500 });
    }
};
