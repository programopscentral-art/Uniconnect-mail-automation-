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

        if (!googleUser.email || !googleUser.verified_email) {
            throw error(400, 'Email not verified or missing');
        }

        const email = googleUser.email.toLowerCase();
        const domain = email.split('@')[1];
        const isNxtwave = domain === 'nxtwave.in' || domain === 'nxtwave.co.in';

        // 1. Check if user exists
        let user = await getUserByEmail(email);

        // 2. Provisioning & Invitation Logic
        const inviteToken = cookies.get('invitation_token');
        let invitation = inviteToken ? await getInvitationByToken(inviteToken) : null;
        if (!invitation) {
            invitation = await getInvitationByEmail(email);
        }

        if (!user) {
            if (invitation) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'User',
                    role: invitation.role,
                    university_id: invitation.university_id
                });
                await deleteInvitation(invitation.id);
                cookies.delete('invitation_token', { path: '/' });
                console.log(`User created via invitation for ${email}`);
            }
            // ADMIN Check
            else if (email === 'karthikeya.a054@gmail.com' || email === env.ADMIN_EMAIL) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'Admin',
                    role: 'ADMIN',
                    university_id: null
                });
            }
            // Nxtwave Employee check
            else if (isNxtwave) {
                user = await createUser({
                    email: email,
                    name: googleUser.name || 'Nxtwave Member',
                    role: 'UNIVERSITY_OPERATOR', // Default role for now, but will have restricted access
                    university_id: null
                });
            }
            // University Operator check (based on domain)
            else {
                const universities = await getAllUniversities();
                const matchedUniv = universities.find(u => u.email_domain && domain === u.email_domain.toLowerCase());

                if (matchedUniv) {
                    user = await createUser({
                        email: email,
                        name: googleUser.name || 'University Member',
                        role: 'UNIVERSITY_OPERATOR',
                        university_id: matchedUniv.id
                    });
                } else {
                    // No university matches domain
                    const genericDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'aol.com', 'live.com'];
                    if (genericDomains.includes(domain)) {
                        throw error(403, 'Please use your official Nxtwave or University email.');
                    }

                    // Allow login but with no university assigned - will redirect to /request-access
                    user = await createUser({
                        email,
                        name: googleUser.name || 'User',
                        role: 'UNIVERSITY_OPERATOR',
                        university_id: null,
                    });
                    console.log(`User created with unknown domain ${domain}, redirecting to request-access`);
                }
            }
        } else {
            // User exists - check if they were accepting an invitation to update their role/university
            if (invitation) {
                await db.query(
                    `UPDATE users SET role = $1, university_id = $2, updated_at = NOW() WHERE id = $3`,
                    [invitation.role, invitation.university_id, user.id]
                );
                await deleteInvitation(invitation.id);
                cookies.delete('invitation_token', { path: '/' });
                console.log(`Existing user ${email} updated via invitation`);

                // Refresh local user object
                user = await getUserByEmail(email) as any;
            }
            // Update last login
            await updateLastLogin(user.id);
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
    } catch (err) {
        if ((err as any).status === 302) throw err; // Re-throw redirects

        console.error('CRITICAL Auth Error Details:', {
            message: (err as Error).message,
            stack: (err as Error).stack,
            raw: err
        });

        // Return a JSON response for easier debugging in browser if 500
        // Return an HTML response with a Try Again button
        const html = `
            <html>
                <body style="font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb;">
                    <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px;">
                        <h1 style="color: #ef4444; margin-bottom: 1rem;">Authentication Failed</h1>
                        <p style="color: #374151; margin-bottom: 1.5rem;">
                            Google refused the login attempt. This usually happens if you <strong>refresh the page</strong> or if the session expired.
                        </p>
                        <div style="background: #fee2e2; padding: 0.75rem; border-radius: 4px; margin-bottom: 1.5rem; font-family: monospace; font-size: 0.875rem; color: #b91c1c; word-break: break-all;">
                            ${(err as Error).message}
                        </div>
                        <a href="/api/auth/google/start" style="display: inline-block; background: #2563eb; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 500;">
                            Try Login Again
                        </a>
                    </div>
                </body>
            </html>
        `;

        return new Response(html, {
            status: 500,
            headers: { 'Content-Type': 'text/html' }
        });
    }
};
