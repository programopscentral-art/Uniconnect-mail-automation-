import { json, type RequestHandler } from '@sveltejs/kit';
import { SchedulingService } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ request, locals }) => {
    // 1. RBAC check (Admin or Faculty with scheduling perm assumed)
    // if (!locals.user.roles.includes('PROGRAM_OPS_ADMIN')) { return json({ error: 'unauthorized' }, { status: 403 }); }

    const body = await request.json();
    const { session, versionId } = body;

    try {
        const conflicts = await SchedulingService.detectConflicts(session, versionId);
        return json({ conflicts });
    } catch (err: any) {
        console.error('Validation error:', err);
        return json({ error: err.message }, { status: 500 });
    }
}
