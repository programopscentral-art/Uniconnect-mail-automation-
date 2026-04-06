import { getSheetsTokens } from '$lib/server/sheets_auth';
import { createSheetConnection, encryptString, db, updateSheetSharedEmails } from '@uniconnect/shared';
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
        const newScopes = 'spreadsheets.readonly,userinfo.email,drive.metadata.readonly';

        // Update refresh token on ALL existing sheet connections for this user+email
        // so they pick up the new Drive scope for permissions
        await db.query(
            `UPDATE sheet_connections SET refresh_token_enc = $1, scopes = $2, updated_at = NOW()
             WHERE user_id = $3 AND google_email = $4 AND status != 'REVOKED'`,
            [encryptedToken, newScopes, userId, email]
        );

        // Store a temporary connection — user will link a specific sheet on the /sheets page
        await createSheetConnection({
            user_id: userId,
            sheet_name: 'Google Account Connected',
            sheet_url: '',
            spreadsheet_id: `pending_${userId}_${Date.now()}`,
            refresh_token_enc: encryptedToken,
            google_email: email,
            scopes: newScopes
        });

        // Sync Google Drive permissions for all existing sheets in background
        syncAllPermissions(tokens.refresh_token, userId).catch(() => {});

        console.log(`[SHEETS_CALLBACK] Connected/reconnected Google Sheets account: ${email} for user ${userId}`);
        throw redirect(302, '/sheets?connected=true');
    } catch (err: any) {
        if (err.status && err.status >= 300 && err.status < 500) throw err;
        console.error('[SHEETS_CALLBACK] Error:', err.message);
        throw error(500, `Failed to connect Google Sheets: ${err.message}`);
    }
};

async function syncAllPermissions(refreshToken: string, userId: string) {
    try {
        const { google } = await import('googleapis');
        const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID?.trim(), env.GOOGLE_CLIENT_SECRET?.trim());
        auth.setCredentials({ refresh_token: refreshToken });
        const drive = google.drive({ version: 'v3', auth });

        // Get all non-pending, non-revoked sheets for this user
        const result = await db.query(
            `SELECT id, spreadsheet_id FROM sheet_connections WHERE user_id = $1 AND status != 'REVOKED' AND NOT spreadsheet_id LIKE 'pending_%'`,
            [userId]
        );

        for (const sheet of result.rows) {
            try {
                const permResp = await drive.permissions.list({
                    fileId: sheet.spreadsheet_id,
                    fields: 'permissions(emailAddress,role,type)'
                });
                const sharedEmails = (permResp.data.permissions || [])
                    .filter((p: any) => p.emailAddress && p.type === 'user')
                    .map((p: any) => p.emailAddress.toLowerCase());
                await updateSheetSharedEmails(sheet.id, sharedEmails);
                console.log(`[SHEETS_CALLBACK] Synced ${sharedEmails.length} permissions for sheet ${sheet.id}`);
            } catch (e: any) {
                console.warn(`[SHEETS_CALLBACK] Failed to sync permissions for ${sheet.id}: ${e.message}`);
            }
        }
    } catch (e: any) {
        console.error('[SHEETS_CALLBACK] Failed to sync all permissions:', e.message);
    }
}
