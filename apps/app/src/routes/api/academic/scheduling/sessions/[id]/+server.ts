import { TimetableOpsService, SchedulingNotificationService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PATCH — edit a session
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json();
    try {
        const updated = await TimetableOpsService.editSession(params.id, body, locals.user?.id);

        // Notify faculty of changes (fire-and-forget)
        if (body.faculty_profile_id !== undefined) {
            SchedulingNotificationService.notifySessionChange(
                params.id, 'EDIT', 'faculty_profile_id', null, null
            ).catch(() => {});
        }

        return json({ success: true, session: updated });
    } catch (e: any) {
        return json({ success: false, message: e.message }, { status: 500 });
    }
};

// DELETE — cancel a session
export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    try {
        // Notify before cancelling (so we can still read session data)
        SchedulingNotificationService.notifySessionChange(params.id, 'CANCEL', 'session_status', 'SCHEDULED', 'CANCELLED').catch(() => {});

        await TimetableOpsService.cancelSession(params.id, locals.user?.id);
        return json({ success: true });
    } catch (e: any) {
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
