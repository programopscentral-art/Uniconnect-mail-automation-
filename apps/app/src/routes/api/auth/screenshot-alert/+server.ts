import { json, error } from '@sveltejs/kit';
import { AccessAlertService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
    process.env.SMTP_USER = env.SMTP_USER;
    process.env.SMTP_PASS = env.SMTP_PASS;
    process.env.SMTP_HOST = env.SMTP_HOST;

    const { context } = await request.json();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const isView = context?.action === 'DOCUMENT_VIEW';

    // Log to document_access_logs for audit trail
    if (context?.studentId) {
        try {
            await db.query(
                `INSERT INTO document_access_logs (student_profile_id, accessed_by, access_type, ip_address, user_agent)
                 VALUES ($1::uuid, $2, $3, $4, $5)`,
                [context.studentId, locals.user.id, isView ? 'VIEW' : 'SCREENSHOT_ATTEMPT', ip, request.headers.get('user-agent') || 'unknown']
            );
        } catch {
            // table might not have nullable document_id, silently skip
        }
    }

    // Only send email alert for screenshot attempts, not regular views
    if (!isView) {
        try {
            await AccessAlertService.sendAccessAlert({
                accessorId: locals.user.id,
                accessorName: locals.user.name as string || 'Unknown',
                accessorEmail: locals.user.email as string || '',
                studentProfileId: context?.studentId || '00000000-0000-0000-0000-000000000000',
                studentName: context?.studentName || 'N/A',
                accessType: 'SCREENSHOT_ATTEMPT',
                details: `Screenshot attempt detected while viewing ${context?.page || 'sensitive content'}`,
                ipAddress: ip
            });
        } catch (err) {
            console.error('[SCREENSHOT_ALERT] Failed:', err);
        }
    }

    return json({ logged: true });
};
