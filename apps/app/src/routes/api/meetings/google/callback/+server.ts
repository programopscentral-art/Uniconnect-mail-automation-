import { getMeetingTokens } from '$lib/server/meeting_auth';
import { createMeetingConnection, encryptString } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Please log in again');

    const code = url.searchParams.get('code');
    const universityId = url.searchParams.get('state');

    if (!code || !universityId) {
        throw error(400, 'Missing code or state');
    }

    try {
        const { tokens, email } = await getMeetingTokens(code);

        if (!tokens.refresh_token) {
            throw error(400, 'No refresh token returned. Please revoke access and try again.');
        }

        if (!email) throw error(400, 'Could not determine email address');

        const encryptedToken = encryptString(tokens.refresh_token);

        await createMeetingConnection({
            university_id: universityId,
            email,
            refresh_token_enc: encryptedToken,
            scopes: 'calendar.readonly,drive.meet.readonly,documents.readonly',
            connected_by: locals.user.id
        });

        console.log(`[MEETING_CALLBACK] Connected meeting bot: ${email} for university ${universityId}`);
        throw redirect(302, '/meetings');
    } catch (err: any) {
        if (err.status && err.status >= 300 && err.status < 500) throw err;
        console.error('[MEETING_CALLBACK] Error:', err.message);
        throw error(500, `Failed to connect meeting bot: ${err.message}`);
    }
};
