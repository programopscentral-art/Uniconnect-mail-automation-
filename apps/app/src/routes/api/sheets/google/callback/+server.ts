import { getSheetsTokens } from '$lib/server/sheets_auth';
import { createSheetConnection, encryptString } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Please log in again');

    const code = url.searchParams.get('code');
    const userId = url.searchParams.get('state');

    if (!code || !userId) {
        throw error(400, 'Missing code or state');
    }

    if (userId !== locals.user.id) {
        throw error(403, 'State mismatch');
    }

    try {
        const { tokens, email } = await getSheetsTokens(code);

        if (!tokens.refresh_token) {
            throw error(400, 'No refresh token returned. Please revoke access and try again.');
        }

        if (!email) throw error(400, 'Could not determine email address');

        const encryptedToken = encryptString(tokens.refresh_token);

        // Store a temporary connection — user will link a specific sheet on the /sheets page
        await createSheetConnection({
            user_id: userId,
            sheet_name: 'Google Account Connected',
            sheet_url: '',
            spreadsheet_id: `pending_${userId}_${Date.now()}`,
            refresh_token_enc: encryptedToken,
            google_email: email,
            scopes: 'spreadsheets.readonly,userinfo.email'
        });

        console.log(`[SHEETS_CALLBACK] Connected Google Sheets account: ${email} for user ${userId}`);
        throw redirect(302, '/sheets?connected=true');
    } catch (err: any) {
        if (err.status && err.status >= 300 && err.status < 500) throw err;
        console.error('[SHEETS_CALLBACK] Error:', err.message);
        throw error(500, `Failed to connect Google Sheets: ${err.message}`);
    }
};
