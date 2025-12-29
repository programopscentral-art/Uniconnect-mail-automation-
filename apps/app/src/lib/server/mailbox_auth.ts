import { google } from 'googleapis';
import { env } from '$env/dynamic/private';
import fs from 'fs';

function logMailboxDebug(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`;
    try {
        fs.appendFileSync('debug_mailbox_auth.log', logLine);
        // Also log to console for visibility
        console.log(`[MAILBOX_DEBUG] ${message}`, data || '');
    } catch (e) {
        console.error('Failed to write to debug_mailbox_auth.log', e);
    }
}

function getMailboxClient() {
    // HARDCODED FALLBACKS to ensure zero-fail configuration
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    // We force this to be exactly what Google expects
    const redirectUri = "http://localhost:3001/api/mailboxes/google/callback";

    console.log('****************************************');
    console.log('DIAGNOSTIC: Google OAuth Redirect URI');
    console.log('EXPECTED IN CONSOLE:', redirectUri);
    console.log('CLIENT ID:', clientId);
    console.log('****************************************');

    logMailboxDebug('Initializing OAuth2 Client', { clientId, redirectUri });

    return new google.auth.OAuth2(
        clientId.trim(),
        clientSecret.trim(),
        redirectUri.trim()
    );
}

export function getMailboxAuthUrl(universityId: string) {
    const client = getMailboxClient();
    const redirectUri = "http://localhost:3001/api/mailboxes/google/callback";

    const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: 'consent',
        state: universityId,
        redirect_uri: redirectUri
    });

    logMailboxDebug('Generated Auth URL', { url, redirectUri });
    return url;
}

export async function getMailboxTokens(code: string) {
    const client = getMailboxClient();

    logMailboxDebug('Exchanging code for tokens', { code: code.substring(0, 5) + '...' });

    try {
        const { tokens } = await client.getToken(code);
        logMailboxDebug('Token exchange successful');

        client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const { data } = await oauth2.userinfo.get();

        logMailboxDebug('User info retrieved', { email: data.email });

        return {
            tokens,
            email: data.email
        };
    } catch (err: any) {
        logMailboxDebug('Token exchange failed', {
            message: err.message,
            response: err.response?.data
        });
        throw err;
    }
}
