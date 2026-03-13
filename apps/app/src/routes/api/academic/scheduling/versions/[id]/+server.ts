import { TimetableOpsService, SchedulingService, SchedulingNotificationService, db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — version detail
export const GET: RequestHandler = async ({ params }) => {
    try {
        const detail = await TimetableOpsService.getVersionDetail(params.id);
        if (!detail) throw error(404, 'Version not found');
        return json(detail);
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};

// PATCH — publish or archive a version
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    const { action, universityId } = body;

    try {
        if (action === 'publish') {
            if (!universityId) throw error(400, 'universityId required');
            await SchedulingService.publishTimetable(universityId, params.id, locals.user?.id || '');
            // Fire-and-forget notifications
            SchedulingNotificationService.notifyTimetablePublished(universityId, params.id).catch(() => {});
            return json({ success: true, message: 'Published' });
        }

        if (action === 'archive') {
            await db.query(
                `UPDATE timetable_versions SET version_status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
                [params.id]
            );
            return json({ success: true, message: 'Archived' });
        }

        throw error(400, 'Invalid action');
    } catch (e: any) {
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
