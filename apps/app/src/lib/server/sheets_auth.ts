import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

function getSheetsClient() {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_SHEETS_REDIRECT_URI || env.GOOGLE_GMAIL_REDIRECT_URI?.replace('mailboxes', 'sheets') || 'http://localhost:3001/api/sheets/google/callback';

    return new google.auth.OAuth2(
        clientId.trim(),
        clientSecret.trim(),
        redirectUri.trim()
    );
}

export function getSheetsAuthUrl(userId: string) {
    const client = getSheetsClient();
    const redirectUri = env.GOOGLE_SHEETS_REDIRECT_URI || env.GOOGLE_GMAIL_REDIRECT_URI?.replace('mailboxes', 'sheets') || 'http://localhost:3001/api/sheets/google/callback';

    const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
        prompt: 'consent',
        state: userId,
        redirect_uri: redirectUri
    });

    console.log('[SHEETS_AUTH] Generated auth URL for user:', userId);
    return url;
}

export async function getSheetsTokens(code: string) {
    const client = getSheetsClient();

    try {
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const { data } = await oauth2.userinfo.get();

        console.log('[SHEETS_AUTH] Token exchange successful for:', data.email);

        return {
            tokens,
            email: data.email
        };
    } catch (err: any) {
        console.error('[SHEETS_AUTH] Token exchange failed:', err.message);
        throw err;
    }
}

export function getSheetsApiClient(refreshToken: string) {
    const client = getSheetsClient();
    client.setCredentials({ refresh_token: refreshToken });
    return google.sheets({ version: 'v4', auth: client });
}

export function extractSpreadsheetId(url: string): string | null {
    // Supports URLs like:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}
