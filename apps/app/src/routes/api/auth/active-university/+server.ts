import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, cookies, locals }: any) => {
    if (!locals.user) throw error(401);

    const { universityId } = await request.json();
    if (!universityId) throw error(400, 'University ID is required');

    // Any authenticated user can switch to a university visible in their dropdown.
    // Team members see universities via getAllUniversities(teamId) which resolves
    // through other team members' junction entries — not their own direct assignments.
    // So we allow the switch for any logged-in user rather than checking user_universities.

    cookies.set('active_university_id', universityId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return json({ success: true });
};
