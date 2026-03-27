import { json, error } from '@sveltejs/kit';
import { NumberChallengeService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

/** POST: Create a new number challenge (sends email with options) */
export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
    process.env.SMTP_USER = env.SMTP_USER;
    process.env.SMTP_PASS = env.SMTP_PASS;
    process.env.SMTP_HOST = env.SMTP_HOST;
    process.env.PUBLIC_BASE_URL = env.ORIGIN || 'https://uniconnect-app.up.railway.app';

    const { challengeId, correctNumber, expiresAt } = await NumberChallengeService.createChallenge(
        locals.user.id,
        locals.user.email as string,
        locals.user.name as string
    );

    return json({ challengeId, correctNumber, expiresAt });
};

/** GET: Check if user has a valid (verified) challenge */
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);

    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    const verified = await NumberChallengeService.hasValidVerification(locals.user.id);
    return json({ verified });
};
