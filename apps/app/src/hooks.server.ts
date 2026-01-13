import type { Handle, HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { validateSession } from '@uniconnect/shared';

// Pre-populate process.env for shared packages that depend on it
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get(env.COOKIE_NAME || 'uniconnect_session');

    if (token) {
        try {
            const user = await validateSession(token);
            if (user) {
                // Ensure plain objects for serialization
                event.locals.user = JSON.parse(JSON.stringify(user));
            }
        } catch (e) {
            console.error('Session validation error:', e);
        }
    }

    const path = event.url.pathname;
    const isPublic = path.startsWith('/api/auth') || path === '/login' || path.startsWith('/track') || path.startsWith('/ack');

    if (!isPublic && !event.locals.user) {
        return new Response(null, {
            status: 302,
            headers: { Location: '/login' }
        });
    }

    if (event.locals.user && !isPublic) {
        const user = event.locals.user;
        const isRequestPage = path === '/request-access' || path.startsWith('/api/users/request-access');

        if (user.role !== 'ADMIN' && !user.university_id && !isRequestPage) {
            return new Response(null, {
                status: 302,
                headers: { Location: '/request-access' }
            });
        }
    }

    if (path.startsWith('/universities') || path.startsWith('/users') || path.startsWith('/mail-logs')) {
        const userRole = event.locals.user?.role as any;
        const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';

        if (!isGlobalAdmin) {
            return new Response('Forbidden', { status: 403 });
        }
    }

    return await resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
    const err = error as any;
    // Log concisely to avoid crashing dev terminal with huge Pool/Socket objects
    console.error('SERVER_ERROR:', {
        message: err.message || 'Internal Error',
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 5).join('\n')
    });
    return {
        message: err.message || 'Internal Error',
        code: err.code
    };
};
