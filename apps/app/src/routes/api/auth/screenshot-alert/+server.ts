import { json, error } from '@sveltejs/kit';
import { AccessAlertService } from '@uniconnect/shared';
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

    // Fire-and-forget alert to admins
    AccessAlertService.sendAccessAlert({
        accessorId: locals.user.id,
        accessorName: locals.user.name as string || 'Unknown',
        accessorEmail: locals.user.email as string || '',
        studentProfileId: context?.studentId || '00000000-0000-0000-0000-000000000000',
        studentName: context?.studentName || 'N/A',
        accessType: 'SCREENSHOT_ATTEMPT',
        details: `Screenshot attempt detected while viewing ${context?.page || 'sensitive content'}`,
        ipAddress: ip
    }).catch(() => {});

    return json({ logged: true });
};
