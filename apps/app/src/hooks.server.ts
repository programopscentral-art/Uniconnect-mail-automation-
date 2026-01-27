import type { Handle, HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { validateSession } from '@uniconnect/shared';

// Pre-populate process.env for shared packages that depend on it
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

console.log("-----------------------------------------");
console.log("!!! UNICONNECT BOOTING VERSION 2.0.7 !!!");
console.log("-----------------------------------------");

export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get(env.COOKIE_NAME || 'uniconnect_session');
    const theme = event.cookies.get('theme') || 'light';
    event.locals.theme = theme as 'light' | 'dark';

    if (token) {
        try {
            let user = await validateSession(token);
            if (user) {
                // Handle active university selection
                const activeUnivId = event.cookies.get('active_university_id');
                if (activeUnivId) {
                    const hasAccess = user.universities?.some(u => u.id === activeUnivId);
                    if (hasAccess || user.role === 'ADMIN' || user.role === 'PROGRAM_OPS') {
                        // If 'ALL' is selected, we set university_id to null to indicate global context
                        user.university_id = activeUnivId === 'ALL' ? null : activeUnivId;
                    }
                }

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

        // Dynamic Permission Enforcement
        const featureMap: Record<string, string> = {
            '/dashboard': 'dashboard',
            '/tasks': 'tasks',
            '/universities': 'universities',
            '/students': 'students',
            '/users': 'users',
            '/analytics': 'analytics',
            '/mailboxes': 'mailboxes',
            '/templates': 'templates',
            '/campaigns': 'campaigns',
            '/assessments': 'assessments',
            '/mail-logs': 'mail-logs',
            '/permissions': 'permissions'
        };

        const matchingPath = Object.keys(featureMap).find(p => path.startsWith(p));
        if (matchingPath) {
            const requiredFeature = featureMap[matchingPath];
            if (!user.permissions?.includes(requiredFeature)) {
                return new Response('Forbidden: Feature not enabled for your role', { status: 403 });
            }
        }
    }

    return await resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
    const err = error as any;

    // NUCLEAR SILENCE: Stop ALL 404 and favicon noise from hitting logs
    if (err.status === 404 || (err.message || '').toLowerCase().includes('favicon') || (err.message || '').includes('Not found')) {
        return { message: 'Not Found', code: '404' };
    }

    console.error('SERVER_ERROR_V207:', {
        message: err.message || 'Internal Error',
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 5).join('\n')
    });
    return {
        message: err.message || 'Internal Error',
        code: err.code
    };
};
