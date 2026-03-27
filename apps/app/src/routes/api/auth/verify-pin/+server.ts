import { json, error } from '@sveltejs/kit';
import { SecurityPinService, NumberChallengeService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    if (!locals.user) throw error(401);

    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    const body = await request.json();

    // Email challenge verification path
    if (body.emailChallenge) {
        const verified = await NumberChallengeService.hasValidVerification(locals.user.id);
        if (!verified) throw error(403, 'No valid email verification found');
    } else {
        // PIN verification path
        const { pin } = body;
        if (!pin) throw error(400, 'PIN is required');

        const valid = await SecurityPinService.verifyPin(locals.user.id, pin);
        if (!valid) throw error(403, 'Incorrect PIN');
    }

    // Generate a signed verification token and set as cookie (5 min TTL)
    const sessionToken = cookies.get(env.COOKIE_NAME || 'uniconnect_session') || '';
    const verificationToken = SecurityPinService.generateVerificationToken(sessionToken, 300);

    cookies.set('pin_verified', verificationToken, {
        path: '/',
        httpOnly: true,
        secure: env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: 300 // 5 minutes
    });

    return json({ verified: true, expiresIn: 300 });
};
