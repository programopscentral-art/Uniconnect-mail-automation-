import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

function getMeetingClient() {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_MEETING_REDIRECT_URI || env.GOOGLE_GMAIL_REDIRECT_URI?.replace('mailboxes', 'meetings') || 'http://localhost:3001/api/meetings/google/callback';

    return new google.auth.OAuth2(
        clientId.trim(),
        clientSecret.trim(),
        redirectUri.trim()
    );
}

export function getMeetingAuthUrl(userId: string) {
    const client = getMeetingClient();
    const redirectUri = env.GOOGLE_MEETING_REDIRECT_URI || env.GOOGLE_GMAIL_REDIRECT_URI?.replace('mailboxes', 'meetings') || 'http://localhost:3001/api/meetings/google/callback';

    const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/drive.meet.readonly',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: 'consent',
        state: userId,
        redirect_uri: redirectUri
    });

    console.log('[MEETING_AUTH] Generated auth URL for user:', userId);
    return url;
}

export async function getMeetingTokens(code: string) {
    const client = getMeetingClient();

    try {
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const { data } = await oauth2.userinfo.get();

        console.log('[MEETING_AUTH] Token exchange successful for:', data.email);

        return {
            tokens,
            email: data.email
        };
    } catch (err: any) {
        console.error('[MEETING_AUTH] Token exchange failed:', err.message);
        throw err;
    }
}
