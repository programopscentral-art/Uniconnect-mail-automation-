import { TimetableGeneratorService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — generate a weekly timetable draft
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { universityId, programId, termId, apdPlanId, weekStart, weekEnd, sectionIds, saveDraft } = body;

    if (!universityId || !weekStart || !weekEnd) {
        throw error(400, 'universityId, weekStart, and weekEnd are required');
    }

    try {
        // Generate timetable
        const result = await TimetableGeneratorService.generateWeeklyTimetable({
            university_id: universityId,
            program_id: programId || undefined,
            term_id: termId || undefined,
            apd_plan_id: apdPlanId || undefined,
            week_start: weekStart,
            week_end: weekEnd,
            section_ids: sectionIds || undefined
        });

        // Optionally save as draft
        let savedVersion = null;
        if (saveDraft && result.sessions.length > 0) {
            savedVersion = await TimetableGeneratorService.saveGeneratedDraft({
                university_id: universityId,
                program_id: programId || undefined,
                term_id: termId || undefined,
                apd_plan_id: apdPlanId || undefined,
                week_start: weekStart,
                week_end: weekEnd
            }, result.sessions, locals.user?.id);
        }

        return json({
            success: true,
            sessions: result.sessions,
            unassigned: result.unassigned,
            warnings: result.warnings,
            stats: result.stats,
            savedVersion: savedVersion ? {
                versionId: savedVersion.version.id,
                versionNumber: savedVersion.version.version_number,
                sessionsCreated: savedVersion.sessionsCreated
            } : null
        });
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/generate]', e);
        return json({ success: false, message: e.message || 'Generation failed' }, { status: 500 });
    }
};
