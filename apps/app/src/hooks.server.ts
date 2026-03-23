import type { Handle, HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { validateSession, getRolePermissions } from '@uniconnect/shared';

// EMERGENCY FIX: Bypass SSL certificate verification for production stability
// Resolves: "self-signed certificate in certificate chain" errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log("-----------------------------------------");
console.log("!!! UNICONNECT BOOTING VERSION 2.0.8 !!!");
console.log("-----------------------------------------");
console.log("[HOOKS] Attempting to initialize Firebase Admin...");
import '$lib/server/firebase-admin';

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
                    } else {
                        // Cookie points to a university the user no longer has access to
                        // (e.g. admin changed their universities) — fall back to their first accessible university
                        if (user.universities?.length > 0) {
                            user.university_id = user.universities[0].id;
                            event.cookies.set('active_university_id', user.universities[0].id, {
                                path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365
                            });
                        }
                        // else: keep whatever university_id is in the DB
                    }
                } else if (!user.university_id && user.universities?.length > 0) {
                    // No cookie set and no primary university — auto-select first accessible
                    user.university_id = user.universities[0].id;
                    event.cookies.set('active_university_id', user.universities[0].id, {
                        path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365
                    });
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

        if (user.role !== 'ADMIN' && user.role !== 'PROGRAM_OPS' && user.role !== 'BOA' && !user.university_id && !isRequestPage) {
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
            '/permissions': 'permissions',
            '/day-plan': 'day-plan',
            '/communication-tasks': 'communication-tasks',
            '/budget-proposals': 'budget-proposals',
            '/academic-operations': 'academic-operations',
            '/ops-dashboard': 'analytics',
            // Faculty portal: accessible to FACULTY role and ADMIN/PROGRAM_OPS (handled by isPrivileged)
            // FACULTY role bypass is handled below
        };

        // FACULTY role gets access to their portal and basic academic routes without needing explicit permissions
        const isFaculty = user.role === 'FACULTY';
        const facultyAllowedPaths = [
            '/faculty-portal', '/assessments', '/tasks', '/students',
            '/api/faculty/',
            '/api/academic/faculty/leave-requests',
            '/api/academic/scheduling/sessions',
        ];
        if (isFaculty && facultyAllowedPaths.some(p => path.startsWith(p))) {
            return await resolve(event);
        }

        const matchingPath = Object.keys(featureMap).find(p => path.startsWith(p));
        if (matchingPath) {
            const requiredFeature = featureMap[matchingPath];
            const isPrivileged = user.role === 'ADMIN' || user.role === 'PROGRAM_OPS';
            if (!isPrivileged && !user.permissions?.includes(requiredFeature)) {
                return new Response('Forbidden: Feature not enabled for your role', { status: 403 });
            }
        }
    }

    return await resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
    const err = error as any;

    // NUCLEAR SILENCE: Completely stop ALL 404 and favicon noise from hitting logs
    const msg = (err?.message || '').toLowerCase();
    const is404 = err?.status === 404 || msg.includes('not found') || msg.includes('favicon');

    if (is404) {
        return { message: 'Not Found', code: '404' };
    }

    console.error('SERVER_ERROR_V214:', {
        message: err?.message || 'Internal Error',
        code: err?.code,
        stack: err?.stack?.split('\n').slice(0, 5).join('\n')
    });
    return {
        message: err?.message || 'Internal Error',
        code: err?.code
    };
};