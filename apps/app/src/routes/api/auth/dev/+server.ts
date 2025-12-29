import { redirect } from '@sveltejs/kit';
import { getUserByEmail, createUser, createSession } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ cookies }) => {
    // Populate process.env manually for the @uniconnect/shared package which expects it
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    // For local testing only
    const email = 'karthikeya.a054@gmail.com'; // Admin user
    let user = await getUserByEmail(email);

    if (!user) {
        user = await createUser({
            email,
            name: 'Dev Admin',
            role: 'ADMIN',
            university_id: null
        });
    }

    const token = await createSession(user.id);
    const cookieName = env.COOKIE_NAME || 'uniconnect_session';

    cookies.set(cookieName, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    throw redirect(302, '/templates');
};
