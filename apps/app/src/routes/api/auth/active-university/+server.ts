import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, cookies, locals }: any) => {
    if (!locals.user) throw error(401);

    const { universityId } = await request.json();
    if (!universityId) throw error(400, 'University ID is required');

    // Check if user has access (Admins have access to all)
    const hasAccess = locals.user.universities.some((u: any) => u.id === universityId) ||
        locals.user.role === 'ADMIN' ||
        locals.user.role === 'PROGRAM_OPS';

    if (!hasAccess && universityId !== 'ALL') {
        throw error(403, 'Permission denied');
    }

    cookies.set('active_university_id', universityId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return json({ success: true });
};
