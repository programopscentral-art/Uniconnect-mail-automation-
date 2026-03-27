import { json, error } from '@sveltejs/kit';
import { StudentPIIService, SecurityPinService, AccessAlertService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, url, locals, cookies, request }) => {
    if (!locals.user) throw error(401);

    const masked = url.searchParams.get('masked') === 'true';

    try {
        if (masked) {
            const data = await StudentPIIService.getMaskedPII(params.id);
            return json(data);
        } else {
            // PIN verification required for full PII reveal
            process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
            const hasPin = await SecurityPinService.hasPin(locals.user.id);
            if (hasPin) {
                const pinCookie = cookies.get('pin_verified');
                const sessionToken = cookies.get(env.COOKIE_NAME || 'uniconnect_session') || '';
                if (!pinCookie || !SecurityPinService.verifyVerificationToken(pinCookie, sessionToken)) {
                    return json({ requirePin: true }, { status: 428 });
                }
            }

            const data = await StudentPIIService.decryptPII(
                params.id,
                locals.user.role as string,
                locals.user.id
            );

            // Send access alert to admins (fire-and-forget)
            const studentRes = await db.query(
                "SELECT sp.id, u.name FROM student_profiles sp LEFT JOIN users u ON sp.user_id = u.id WHERE sp.id = $1",
                [params.id]
            );
            const studentName = studentRes.rows[0]?.name || 'Unknown';
            AccessAlertService.sendAccessAlert({
                accessorId: locals.user.id,
                accessorName: locals.user.name as string,
                accessorEmail: locals.user.email as string,
                studentProfileId: params.id,
                studentName,
                accessType: 'PII_ACCESS',
                details: `Revealed ${Object.keys(data).length} PII fields`,
                ipAddress: request.headers.get('x-forwarded-for') || undefined
            }).catch(() => {});

            return json(data);
        }
    } catch (e: any) {
        throw error(e.message?.includes('permission') ? 403 : 500, e.message);
    }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    if (!StudentPIIService.hasPIIPermission(locals.user.role as string, 'EDIT')) {
        throw error(403, 'Insufficient permissions to update PII');
    }

    const piiData = await request.json();
    const result = await StudentPIIService.encryptAndStorePII(params.id, piiData, locals.user.id);
    return json(result);
};
