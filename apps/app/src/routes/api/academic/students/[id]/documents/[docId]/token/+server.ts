import { json, error } from '@sveltejs/kit';
import { DocumentTokenService, SecurityPinService, StudentDocumentService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
    if (!locals.user) throw error(401);

    // Verify PIN if user has one set
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
    const hasPin = await SecurityPinService.hasPin(locals.user.id);
    if (hasPin) {
        const pinCookie = cookies.get('pin_verified');
        const sessionToken = cookies.get(env.COOKIE_NAME || 'uniconnect_session') || '';
        if (!pinCookie || !SecurityPinService.verifyVerificationToken(pinCookie, sessionToken)) {
            return json({ requirePin: true }, { status: 428 });
        }
    }

    // Check document access permission
    const role = locals.user.role as string;
    const ALLOWED_ROLES = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER', 'BOA'];
    if (!ALLOWED_ROLES.includes(role)) throw error(403);

    const { token, expiresAt } = DocumentTokenService.generateToken(
        params.docId,
        locals.user.id,
        15 // 15 minute TTL
    );

    return json({
        token,
        url: `/api/documents/serve/${token}`,
        expiresAt,
        expiresIn: 900 // 15 minutes in seconds
    });
};
