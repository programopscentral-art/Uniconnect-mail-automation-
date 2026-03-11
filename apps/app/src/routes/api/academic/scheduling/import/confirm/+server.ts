import { SchedulingService } from '@uniconnect/shared';
import { toSessionInputs } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — confirm import: create version + bulk insert sessions
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
        notes
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

        if (sessionInputs.length === 0) {
            return json({
                success: false,
                message: 'No valid sessions to import. Check subject and section mappings.',
                versionId: version.id
            });
        }

        // 4. Bulk create sessions
        const created = await SchedulingService.bulkCreateSessions(version.id, sessionInputs);

        // 5. Run conflict detection on all created sessions
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

            // Store conflicts (skip slot violations for imports)
            for (const c of conflicts) {
                if (c.conflict_type === 'SLOT_VIOLATION') continue;
                try {
                    const { db } = await import('@uniconnect/shared');
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
            conflictsDetected: conflictCount
        });
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/import/confirm]', e);
        return json({ success: false, message: e.message || 'Import failed' }, { status: 500 });
    }
};
