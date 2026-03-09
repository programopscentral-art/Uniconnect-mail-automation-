import { json, type RequestHandler } from '@sveltejs/kit';
import { AcademicService, ActivityService } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ request, url }) => {
    const { sourceTermId, targetTermId, universityId, programId } = await request.json();

    try {
        const result = await AcademicService.cloneTerm(sourceTermId, targetTermId, universityId, programId);

        // Audit Log
        await ActivityService.log({
            university_id: universityId,
            actor_id: 'SYSTEM_ADMIN_UI_ID', // Replaced by session user ID in real usage
            action_type: 'CLONE_TERM_STRUCTURE',
            entity_type: 'TERM',
            entity_id: targetTermId,
            after_state: result
        });

        return json({
            message: 'Cloned successfully',
            details: `Cloned ${result.subjects} subjects and ${result.sections} sections.`
        });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
}
