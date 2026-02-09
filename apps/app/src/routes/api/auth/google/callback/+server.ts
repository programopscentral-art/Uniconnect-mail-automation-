import { getGoogleUserFromCode } from '$lib/server/auth';
import { getUserByEmail, createUser, createSession, updateLastLogin, getAllUniversities, getInvitationByEmail, deleteInvitation, getInvitationByToken, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const code = url.searchParams.get('code');
    if (!code) {
        throw error(400, 'Missing code parameter');
    }

    try {
        const googleUser = await getGoogleUserFromCode(code);

        if (!googleUser.email) {
            throw error(400, 'Email missing from Google account');
        }

        // We still log verification status but might be more lenient for certain company domains if needed
        if (!googleUser.verified_email) {
            console.warn(`[OAUTH] Warning: Google email not verified for ${googleUser.email}`);
        }

        const email = googleUser.email.toLowerCase();
        const domain = email.split('@')[1];
        const isNxtwave = domain.includes('nxtwave') || domain === 'getnxtwave.com';

        console.log(`[OAUTH] Processing login for ${email} (domain: ${domain}, isNxtwave: ${isNxtwave})`);

        // 1. Check if user exists
        let user = await getUserByEmail(email);

        // 2. Provisioning & Invitation Logic
        const inviteToken = cookies.get('invitation_token');
        let invitation = inviteToken ? await getInvitationByToken(inviteToken) : null;
        if (!invitation) {
            invitation = await getInvitationByEmail(email);
        }

        if (!user) {
            console.log(`[OAUTH] User doesn't exist, attempting auto-provisioning`);
            if (invitation) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'User',
                    role: invitation.role,
                    university_id: invitation.university_id
                });
                await deleteInvitation(invitation.id);
                cookies.delete('invitation_token', { path: '/' });
                console.log(`[OAUTH] User created via invitation for ${email}`);
            }
            // ADMIN Check
            else if (email === 'karthikeya.a054@gmail.com' || email === env.ADMIN_EMAIL) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'Admin',
                    role: 'ADMIN',
                    university_id: null
                });
                console.log(`[OAUTH] Admin created: ${email}`);
            }
            // Nxtwave Employee check
            else if (isNxtwave) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'Nxtwave Member',
                    role: 'UNIVERSITY_OPERATOR', // Default role - will redirect to /request-access
                    university_id: null
                });
                console.log(`[OAUTH] Nxtwave Member created as UNIVERSITY_OPERATOR: ${email}`);
            }
            // University Operator check (based on domain)
            else {
                const universities = await getAllUniversities();
                console.log(`[OAUTH] Available University Domains check for domain ${domain}`);

                const matchedUniv = universities.find(u => u.email_domain && domain === u.email_domain.toLowerCase());

                if (matchedUniv) {
                    user = await createUser({
                        email: email,
                        name: googleUser.name || 'University Member',
                        role: 'UNIVERSITY_OPERATOR',
                        university_id: matchedUniv.id
                    });
                    console.log(`[OAUTH] User created for matched university ${matchedUniv.name}: ${email}`);
                } else {
                    // No university matches domain
                    const genericDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'aol.com', 'live.com'];
                    if (genericDomains.includes(domain)) {
                        console.log(`[OAUTH] Generic domain detected, blocking: ${domain}`);
                        throw error(403, 'Please use your official Nxtwave or University email.');
                    }

                    // Allow login but with no university assigned - will redirect to /request-access
                    user = await createUser({
                        email,
                        name: googleUser.name || 'User',
                        role: 'UNIVERSITY_OPERATOR',
                        university_id: null,
                    });
                    console.log(`[OAUTH] User created with unknown company domain ${domain}, will redirect to request-access: ${email}`);
                }
            }
        } else {
            console.log(`[OAUTH] Existing user log in: ${email} (Role: ${user.role}, Univ: ${user.university_id})`);

            // Auto-Reactivate Nxtwave employees if they were deactivated
            if (isNxtwave && !user.is_active) {
                await db.query(
                    `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
                    [true, user.id]
                );
                user.is_active = true;
                console.log(`[OAUTH] Auto-Reactivated Nxtwave user ${email}`);
            }

            // User exists - check if they were accepting an invitation to update their role/university
            if (invitation) {
                await db.query(
                    `UPDATE users SET role = $1, university_id = $2, updated_at = NOW() WHERE id = $3`,
                    [invitation.role, invitation.university_id, user.id]
                );
                await deleteInvitation(invitation.id);
                cookies.delete('invitation_token', { path: '/' });
                console.log(`[OAUTH] Existing user ${email} updated via invitation`);

                // Refresh local user object
                user = await getUserByEmail(email) as any;
            }
            if (user) {
                await updateLastLogin(user.id);
            }
        }

        if (!user) {
            throw error(403, 'Your account could not be provisioned automatically. Please contact an administrator.');
        }

        if (!user.is_active) {
            throw error(403, 'User account is deactivated');
        }

        // 3. Create Session
        const sessionToken = await createSession(user.id);

        // 4. Set Cookie
        cookies.set(env.COOKIE_NAME || 'uniconnect_session', sessionToken, {
            path: '/',
            httpOnly: true,
            secure: env.COOKIE_SECURE === 'true', // Set to true in prod
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        throw redirect(302, '/dashboard');
    } catch (err: any) {
        if (err.status === 302) throw err; // Re-throw redirects

        // Extract the most descriptive error message possible
        let errorMessage = 'An unexpected authentication error occurred';
        if (err.body?.message) {
            errorMessage = err.body.message;
        } else if (err.message) {
            errorMessage = err.message;
        } else if (typeof err === 'string') {
            errorMessage = err;
        }

        const statusCode = err.status || 500;

        // CRITICAL: Log detailed diagnostic info for production troubleshooting
        console.error('--- OAUTH_FAILURE_DIAGNOSTIC ---');
        console.error('Status:', statusCode);
        console.error('Message:', errorMessage);
        console.error('Code Received:', code ? 'YES' : 'NO');
        console.error('Stack:', err.stack);
        console.error('Full Error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        console.error('---------------------------------');

        // Return a professional, branded HTML response
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Error | UniConnect</title>
                <style>
                    body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
                    .card { background: white; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); padding: 40px; max-width: 480px; width: 100%; text-align: center; border: 1px solid #f1f5f9; }
                    .icon { width: 64px; height: 64px; background: #fee2e2; color: #ef4444; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
                    h1 { font-size: 24px; font-weight: 800; margin: 0 0 16px; color: #0f172a; letter-spacing: -0.025em; }
                    p { font-size: 16px; line-height: 1.6; color: #64748b; margin: 0 0 32px; }
                    .error-box { background: #fff1f2; border: 1px solid #ffe4e6; border-radius: 16px; padding: 20px; text-align: left; margin-bottom: 32px; }
                    .error-label { font-size: 11px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
                    .error-msg { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; color: #b91c1c; font-weight: 600; line-height: 1.5; word-break: break-word; }
                    .btn { display: block; background: #4f46e5; color: white; padding: 16px 24px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 14px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); text-transform: uppercase; letter-spacing: 0.025em; }
                    .btn:hover { background: #4338ca; transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(79, 70, 229, 0.4); }
                    .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">
                        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <h1>Authentication Failed</h1>
                    <p>
                        We encountered an issue while verifying your account with Google. This can happen if you refresh the login page or use an unauthorized email.
                    </p>
                    
                    <div class="error-box">
                        <div class="error-label">Technical Details</div>
                        <div class="error-msg">${errorMessage}</div>
                    </div>

                    <a href="/api/auth/google/start" class="btn">Return to Login</a>
                    
                    <div class="footer">
                        Status: ${statusCode} &bull; Ref: ${Math.floor(Date.now() / 1000)}
                    </div>
                </div>
            </body>
            </html>
        `;

        return new Response(html, {
            status: statusCode,
            headers: { 'Content-Type': 'text/html' }
        });
    }
};
