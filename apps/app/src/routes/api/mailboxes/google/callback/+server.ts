import { getMailboxTokens } from '$lib/server/mailbox_auth';
import { createMailbox, encryptString } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Populate process.env manually for the @uniconnect/shared package which expects it
process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

export const GET: RequestHandler = async ({ url, locals }) => {
    // Note: locals.user might not be available if the cookie is not present on the callback request 
    // (e.g. cross-site issues, though redirect usually preserves it).
    // But we rely on 'state' parameter to know the universityId.
    // Ideally, we should also verify the user is still logged in to prevent attacks.

    if (!locals.user) {
        throw error(401, 'Please log in again');
    }

    const code = url.searchParams.get('code');
    const universityId = url.searchParams.get('state');

    if (!code || !universityId) {
        throw error(400, 'Missing code or state');
    }

    // RBAC check: if operator, state must match their univ
    if (locals.user.role === 'UNIVERSITY_OPERATOR' && universityId !== locals.user.university_id) {
        throw error(403, 'Forbidden');
    }

    try {
        const { tokens, email } = await getMailboxTokens(code);

        console.log('[MAILBOX_CALLBACK] Email:', email);
        console.log('[MAILBOX_CALLBACK] Has Refresh Token:', !!tokens.refresh_token);
        if (tokens.refresh_token) {
            console.log('[MAILBOX_CALLBACK] Refresh Token (first 5 chars):', tokens.refresh_token.substring(0, 5));
        }

        if (!tokens.refresh_token) {
            // This happens if prompt!=consent or re-auth without revoking. 
            // We forced prompt=consent, so it should be there.
            // But if not, we can't send offline.
            throw error(400, 'No refresh token returned. Please revoke access and try again.');
        }

        if (!email) throw error(400, 'Could not determine email address');

        const encryptedToken = encryptString(tokens.refresh_token);

        await createMailbox({
            university_id: universityId,
            email: email,
            refresh_token_enc: encryptedToken,
            scopes: 'https://www.googleapis.com/auth/gmail.send'
        });

        throw redirect(302, '/mailboxes');
    } catch (err: any) {
        if (err.status && err.status >= 300 && err.status < 500) throw err;

        console.error('--- MAILBOX CALLBACK CRITICAL ERROR ---');
        console.error('Message:', err.message);
        console.error('Data:', err.response?.data);
        console.error('Stack:', err.stack);
        console.error('---------------------------------------');

        throw error(500, `Failed to connect mailbox: ${err.message}`);
    }
};
