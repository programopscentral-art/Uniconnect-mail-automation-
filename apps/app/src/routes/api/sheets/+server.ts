import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import {
    getSheetConnections,
    getSheetConnection,
    getSheetConnectionCredentials,
    createSheetConnection,
    deleteSheetConnection,
    updateSheetSyncStatus,
    saveSheetSyncData,
    getLatestSheetSyncData,
    getSheetSyncHistory,
    ensureSheetSchema,
    encryptString,
    decryptString
} from '@uniconnect/shared';
import { getSheetsAuthUrl, getSheetsApiClient, extractSpreadsheetId } from '$lib/server/sheets_auth';

process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

// Ensure schema on first load
let schemaReady = false;
async function ensureReady() {
    if (!schemaReady) {
        await ensureSheetSchema();
        schemaReady = true;
    }
}

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    await ensureReady();

    const action = url.searchParams.get('action');

    // Get auth URL for connecting Google account
    if (action === 'auth-url') {
        const authUrl = getSheetsAuthUrl(locals.user.id);
        return json({ url: authUrl });
    }

    // List user's connected sheets
    if (action === 'list') {
        const sheets = await getSheetConnections(locals.user.id);
        return json({ sheets });
    }

    // Get latest synced data for a sheet
    if (action === 'sync-data') {
        const sheetId = url.searchParams.get('sheetId');
        const tab = url.searchParams.get('tab') || undefined;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const data = await getLatestSheetSyncData(sheetId, tab);
        return json({ data });
    }

    // Get sync history for a sheet
    if (action === 'sync-history') {
        const sheetId = url.searchParams.get('sheetId');
        if (!sheetId) throw error(400, 'Missing sheetId');

        const history = await getSheetSyncHistory(sheetId);
        return json({ history });
    }

    return json({ ok: true });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    await ensureReady();

    const body = await request.json();
    const { action } = body;

    // Link a Google Sheet by URL
    if (action === 'link-sheet') {
        const { sheetUrl, sheetName, universityId } = body;
        if (!sheetUrl) throw error(400, 'Sheet URL is required');

        const spreadsheetId = extractSpreadsheetId(sheetUrl);
        if (!spreadsheetId) throw error(400, 'Invalid Google Sheets URL');

        // Find the user's active connection to get the refresh token
        const connections = await getSheetConnections(locals.user.id);
        const pendingConn = connections.find(c => c.spreadsheet_id.startsWith('pending_'));

        if (!pendingConn) {
            throw error(400, 'No Google account connected. Please connect your Google account first.');
        }

        // Get the encrypted token from the pending connection
        const creds = await getSheetConnectionCredentials(pendingConn.id);
        if (!creds) throw error(400, 'Connection credentials not found');

        // Verify we can access this sheet
        try {
            const refreshToken = decryptString(creds.refresh_token_enc);
            const sheetsApi = getSheetsApiClient(refreshToken);
            const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
            const title = sheetName || metadata.data.properties?.title || 'Untitled Sheet';

            // Create the real sheet connection
            const connection = await createSheetConnection({
                user_id: locals.user.id,
                university_id: universityId || undefined,
                sheet_name: title,
                sheet_url: sheetUrl,
                spreadsheet_id: spreadsheetId,
                refresh_token_enc: creds.refresh_token_enc,
                google_email: creds.google_email,
                scopes: creds.scopes
            });

            console.log(`[SHEETS] Linked sheet: ${title} (${spreadsheetId}) for user ${locals.user.id}`);
            return json({ connection, sheetTitle: title });
        } catch (err: any) {
            console.error('[SHEETS] Failed to access sheet:', err.message);
            throw error(400, `Cannot access this sheet. Make sure it's shared with ${creds.google_email}. Error: ${err.message}`);
        }
    }

    // Sync sheet data from Google
    if (action === 'sync') {
        const { sheetId, tab } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const creds = await getSheetConnectionCredentials(sheetId);
        if (!creds) throw error(404, 'Sheet connection not found');

        try {
            const refreshToken = decryptString(creds.refresh_token_enc);
            const sheetsApi = getSheetsApiClient(refreshToken);

            // Get sheet metadata to find tab names
            const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId: creds.spreadsheet_id });
            const sheets = metadata.data.sheets || [];
            const tabName = tab || sheets[0]?.properties?.title || 'Sheet1';

            // Fetch all data from the tab
            const response = await sheetsApi.spreadsheets.values.get({
                spreadsheetId: creds.spreadsheet_id,
                range: `'${tabName}'`
            });

            const values = response.data.values || [];
            const headers = values.length > 0 ? values[0] : [];
            const rows = values.length > 1 ? values.slice(1) : [];

            // Save sync data
            const syncData = await saveSheetSyncData({
                sheet_connection_id: sheetId,
                sheet_tab: tabName,
                headers,
                rows
            });

            await updateSheetSyncStatus(sheetId, 'ACTIVE');

            // Return tab list too
            const tabList = sheets.map(s => s.properties?.title || 'Sheet1');

            console.log(`[SHEETS] Synced ${rows.length} rows from ${tabName} for sheet ${sheetId}`);
            return json({ syncData, tabs: tabList, rowCount: rows.length, headers });
        } catch (err: any) {
            await updateSheetSyncStatus(sheetId, 'ERROR', err.message);
            console.error('[SHEETS] Sync failed:', err.message);
            throw error(500, `Sync failed: ${err.message}`);
        }
    }

    // AI analyze synced sheet data
    if (action === 'ai-analyze') {
        const { sheetId, tab } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const syncData = await getLatestSheetSyncData(sheetId, tab);
        if (!syncData) throw error(404, 'No synced data found. Sync the sheet first.');

        const headers = syncData.headers;
        const rows = syncData.rows;

        // Build context for AI
        const sampleRows = rows.slice(0, 10);
        const prompt = `You are an AI assistant helping analyze spreadsheet data inside UniConnect.

The sheet has ${rows.length} rows and these columns: ${JSON.stringify(headers)}

Here are the first ${sampleRows.length} rows of data:
${sampleRows.map((r: any[], i: number) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

Please analyze this data and provide:
1. **Data Summary** — What does this sheet contain? What's the structure?
2. **Data Quality** — Any missing values, inconsistencies, or potential errors?
3. **Suggestions** — What patterns do you see? Any recommendations for the user?
4. **Alerts** — Anything that looks unusual or needs attention?

Keep it concise and actionable. Use bullet points.`;

        try {
            const geminiKey = env.GEMINI_API_KEY;
            if (!geminiKey) throw error(500, 'Gemini API key not configured');

            const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 4096,
                            temperature: 0.3
                        }
                    })
                }
            );

            if (!geminiResponse.ok) {
                const errText = await geminiResponse.text();
                throw new Error(`Gemini API error: ${errText}`);
            }

            const geminiData = await geminiResponse.json();
            const analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated.';

            return json({ analysis, rowCount: rows.length, colCount: headers.length });
        } catch (err: any) {
            console.error('[SHEETS_AI] Analysis failed:', err.message);
            throw error(500, `AI analysis failed: ${err.message}`);
        }
    }

    // Delete/disconnect a sheet
    if (action === 'disconnect') {
        const { sheetId } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');
        await deleteSheetConnection(sheetId, locals.user.id);
        return json({ ok: true });
    }

    throw error(400, 'Unknown action');
};
