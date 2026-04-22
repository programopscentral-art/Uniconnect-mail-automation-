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
    decryptString,
    analyzeColumns,
    importStudentsFromSheet,
    importEventsFromSheet,
    importTasksFromSheet,
    importCustomData,
    updateSheetSharedEmails
} from '@uniconnect/shared';
import type { ColumnMapping, UniConnectTarget } from '@uniconnect/shared';
import { getSheetsAuthUrl, getSheetsApiClient, extractSpreadsheetId } from '$lib/server/sheets_auth';

process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

// Fetch Google Sheet permissions and store shared emails
async function syncGooglePermissions(refreshToken: string, spreadsheetId: string, connectionId: string) {
    try {
        const { google } = await import('googleapis');
        const auth = new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID?.trim(),
            env.GOOGLE_CLIENT_SECRET?.trim()
        );
        auth.setCredentials({ refresh_token: refreshToken });
        const drive = google.drive({ version: 'v3', auth });
        const permResp = await drive.permissions.list({
            fileId: spreadsheetId,
            fields: 'permissions(emailAddress,role,type,displayName)'
        });
        const permissions = permResp.data.permissions || [];
        const sharedEmails = permissions
            .filter((p: any) => p.emailAddress && p.type === 'user')
            .map((p: any) => p.emailAddress.toLowerCase());
        await updateSheetSharedEmails(connectionId, sharedEmails);
        console.log(`[SHEETS] Synced ${sharedEmails.length} shared emails for ${connectionId}`);
        return sharedEmails;
    } catch (e: any) {
        // Drive permissions may require drive.readonly scope — gracefully degrade
        console.warn(`[SHEETS] Failed to sync Google permissions for ${connectionId}: ${e.message}`);
        return [];
    }
}

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

    // List user's connected sheets + sheets shared with them via Google
    if (action === 'list') {
        const sheets = await getSheetConnections(locals.user.id, locals.user.email);

        // Auto-refresh tab gids for sheets that have tabs stored as plain strings (no gid)
        for (const sheet of sheets) {
            if (sheet.spreadsheet_id?.startsWith('pending_')) continue;
            let tabs: any[] = [];
            if (typeof sheet.tabs === 'string') { try { tabs = JSON.parse(sheet.tabs); } catch { tabs = []; } }
            else if (Array.isArray(sheet.tabs)) tabs = sheet.tabs;
            const needsGidRefresh = tabs.length > 0 && tabs.some((t: any) => typeof t === 'string' || t.gid === undefined || t.gid === null);
            if (needsGidRefresh) {
                try {
                    const creds = await getSheetConnectionCredentials(sheet.id);
                    if (creds?.refresh_token_enc) {
                        const refreshToken = decryptString(creds.refresh_token_enc);
                        const sheetsApi = getSheetsApiClient(refreshToken);
                        const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId: creds.spreadsheet_id });
                        const freshTabs = (metadata.data.sheets || []).map((s: any) => ({
                            name: s.properties?.title || 'Sheet1',
                            gid: s.properties?.sheetId ?? 0
                        }));
                        await updateSheetSyncStatus(sheet.id, 'ACTIVE', undefined, freshTabs as any);
                        sheet.tabs = freshTabs;
                    }
                } catch (e) {
                    console.warn(`[SHEETS] Failed to refresh tab gids for ${sheet.id}:`, e);
                }
            }
        }

        // Background: refresh Google Drive permissions for owned sheets so sharing stays current
        const ownedSheets = sheets.filter(s => s.is_owner !== false && !s.spreadsheet_id?.startsWith('pending_'));
        for (const sheet of ownedSheets) {
            const creds = await getSheetConnectionCredentials(sheet.id);
            if (creds?.refresh_token_enc) {
                const rt = decryptString(creds.refresh_token_enc);
                syncGooglePermissions(rt, creds.spreadsheet_id, sheet.id);
            }
        }

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
        const connections = await getSheetConnections(locals.user.id, locals.user.email);
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
            const sheetTabs = (metadata.data.sheets || []).map((s: any) => ({
                name: s.properties?.title || 'Sheet1',
                gid: s.properties?.sheetId ?? 0
            }));

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

            // Save tabs to connection
            if (sheetTabs.length > 0) {
                await updateSheetSyncStatus(connection.id, 'ACTIVE', undefined, sheetTabs);
            }

            // Sync Google Sheets permissions so shared users auto-see the sheet
            syncGooglePermissions(refreshToken, spreadsheetId, connection.id);

            console.log(`[SHEETS] Linked sheet: ${title} (${spreadsheetId}) with ${sheetTabs.length} tabs for user ${locals.user.id}`);
            return json({ connection: { ...connection, tabs: sheetTabs }, sheetTitle: title, tabs: sheetTabs });
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

            // Save tab list with gid to DB so sidebar can show correct tab + iframe switching works
            const tabList = sheets.map(s => ({
                name: s.properties?.title || 'Sheet1',
                gid: s.properties?.sheetId ?? 0
            }));
            await updateSheetSyncStatus(sheetId, 'ACTIVE', undefined, tabList as any);

            // Refresh Google permissions in background
            syncGooglePermissions(refreshToken, creds.spreadsheet_id, sheetId);

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
            const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
            if (!geminiKey) throw error(500, 'Gemini API key not configured');

            const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 4096,
                            temperature: 0.3
                        } })
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

    // Generate a proper AI report from sheet data
    if (action === 'ai-report') {
        const { sheetId, tab, reportType } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const syncDataResult = await getLatestSheetSyncData(sheetId, tab);
        if (!syncDataResult) throw error(404, 'No synced data found. Sync the sheet first.');

        const headers = syncDataResult.headers;
        const rows = syncDataResult.rows;

        const reportPrompts: Record<string, string> = {
            summary: `Generate a comprehensive EXECUTIVE SUMMARY REPORT from this spreadsheet data.

The sheet has ${rows.length} rows and columns: ${JSON.stringify(headers)}

Full data (up to 50 rows):
${rows.slice(0, 50).map((r: any[], i: number) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

Generate a professional report with these sections:
## Executive Summary
Brief overview of what this data represents and key findings.

## Key Metrics
Important numbers, totals, averages extracted from the data. Present as a clean table.

## Trends & Patterns
What patterns or trends are visible in this data?

## Areas of Concern
Any red flags, missing data, anomalies, or issues.

## Recommendations
Actionable suggestions based on the data.

Format it cleanly with markdown. Include actual numbers from the data.`,

            comparison: `Generate a COMPARISON REPORT analyzing differences and variations in this data.

The sheet has ${rows.length} rows and columns: ${JSON.stringify(headers)}

Data (up to 50 rows):
${rows.slice(0, 50).map((r: any[], i: number) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

Generate:
## Comparison Overview
What entities/items are being compared?

## Side-by-Side Comparison Table
Create a comparison table of key metrics.

## Top Performers
Who/what is performing best and on which metrics?

## Gaps & Disparities
Where are the biggest differences?

## Action Items
What should be done based on these comparisons?

Format cleanly with markdown tables.`,

            detailed: `Generate a DETAILED DATA REPORT with thorough analysis.

The sheet has ${rows.length} rows and columns: ${JSON.stringify(headers)}

Data (up to 50 rows):
${rows.slice(0, 50).map((r: any[], i: number) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

Generate:
## Data Overview
Complete description of dataset — what each column represents, data types, date range if applicable.

## Column-by-Column Analysis
For each important column: min, max, average, mode, distribution notes.

## Data Quality Report
- Missing values per column
- Potential duplicates
- Inconsistent formatting
- Outliers

## Cross-Column Correlations
Any relationships between columns worth noting.

## Summary Table
A clean summary table of all key statistics.

## Conclusions
Key takeaways from this data.

Format with markdown tables and bullet points.`
        };

        const prompt = reportPrompts[reportType || 'summary'] || reportPrompts.summary;

        try {
            const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
            if (!geminiKey) throw error(500, 'Gemini API key not configured');

            const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 8192,
                            temperature: 0.2
                        } })
                }
            );

            if (!geminiResponse.ok) {
                const errText = await geminiResponse.text();
                throw new Error(`Gemini API error: ${errText}`);
            }

            const geminiData = await geminiResponse.json();
            const report = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No report generated.';

            return json({ report, reportType: reportType || 'summary', rowCount: rows.length });
        } catch (err: any) {
            console.error('[SHEETS_AI] Report generation failed:', err.message);
            throw error(500, `Report generation failed: ${err.message}`);
        }
    }

    // Sync all tabs at once
    if (action === 'sync-all') {
        const { sheetId } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const creds = await getSheetConnectionCredentials(sheetId);
        if (!creds) throw error(404, 'Sheet connection not found');

        try {
            const refreshToken = decryptString(creds.refresh_token_enc);
            const sheetsApi = getSheetsApiClient(refreshToken);

            const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId: creds.spreadsheet_id });
            const sheetsList = metadata.data.sheets || [];
            const tabList = sheetsList.map(s => ({
                name: s.properties?.title || 'Sheet1',
                gid: s.properties?.sheetId ?? 0
            }));

            // Sync each tab
            const results = [];
            for (const tabObj of tabList) {
                const tabName = tabObj.name;
                const response = await sheetsApi.spreadsheets.values.get({
                    spreadsheetId: creds.spreadsheet_id,
                    range: `'${tabName}'`
                });
                const values = response.data.values || [];
                const headers = values.length > 0 ? values[0] : [];
                const rowData = values.length > 1 ? values.slice(1) : [];

                await saveSheetSyncData({
                    sheet_connection_id: sheetId,
                    sheet_tab: tabName,
                    headers,
                    rows: rowData
                });
                results.push({ tab: tabName, rows: rowData.length, cols: headers.length });
            }

            await updateSheetSyncStatus(sheetId, 'ACTIVE', undefined, tabList as any);

            console.log(`[SHEETS] Synced all ${tabList.length} tabs for sheet ${sheetId}`);
            return json({ tabs: tabList, results, totalTabs: tabList.length });
        } catch (err: any) {
            await updateSheetSyncStatus(sheetId, 'ERROR', err.message);
            throw error(500, `Sync all failed: ${err.message}`);
        }
    }

    // Analyze columns — auto-recognize known UniConnect data patterns
    if (action === 'analyze-columns') {
        const { sheetId, tab } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const syncDataResult = await getLatestSheetSyncData(sheetId, tab);
        if (!syncDataResult) throw error(404, 'No synced data found. Sync the sheet first.');

        const result = analyzeColumns(syncDataResult.headers, syncDataResult.rows);
        return json(result);
    }

    // Import mapped data into UniConnect tables
    if (action === 'import-mapped') {
        const { sheetId, tab, target, mappings } = body as {
            sheetId: string;
            tab?: string;
            target: UniConnectTarget;
            mappings: ColumnMapping[];
        };
        if (!sheetId || !target || !mappings?.length) throw error(400, 'Missing sheetId, target, or mappings');

        const syncDataResult = await getLatestSheetSyncData(sheetId, tab);
        if (!syncDataResult) throw error(404, 'No synced data found. Sync the sheet first.');

        const universityId = locals.user.university_id || '';
        const userId = locals.user.id;

        let result: { imported?: number; stored?: number; skipped?: number; errors?: string[] };

        switch (target) {
            case 'students':
                result = await importStudentsFromSheet(syncDataResult.rows, mappings, universityId, userId);
                break;
            case 'events':
                result = await importEventsFromSheet(syncDataResult.rows, mappings, universityId, userId);
                break;
            case 'tasks':
                result = await importTasksFromSheet(syncDataResult.rows, mappings, universityId, userId);
                break;
            case 'custom':
                result = await importCustomData(sheetId, tab || 'Sheet1', syncDataResult.headers, syncDataResult.rows);
                break;
            default:
                // For targets without dedicated import (ops_daily, budget, communication), store as custom
                result = await importCustomData(sheetId, tab || 'Sheet1', syncDataResult.headers, syncDataResult.rows);
                break;
        }

        console.log(`[SHEETS] Imported ${target}: ${JSON.stringify(result)}`);
        return json({ ok: true, target, ...result });
    }

    // Update synced data (inline editor save)
    if (action === 'update-data') {
        const { sheetId, tab, headers, rows } = body;
        if (!sheetId || !headers) throw error(400, 'Missing sheetId or headers');
        await saveSheetSyncData({
            sheet_connection_id: sheetId,
            sheet_tab: tab || 'Sheet1',
            headers,
            rows: rows || []
        });
        await updateSheetSyncStatus(sheetId, 'ACTIVE');
        console.log(`[SHEETS] Updated data: ${(rows || []).length} rows for tab ${tab} of sheet ${sheetId}`);
        return json({ ok: true, rowCount: (rows || []).length });
    }

    // Rename a sheet connection
    if (action === 'rename') {
        const { sheetId, newName } = body;
        if (!sheetId || !newName?.trim()) throw error(400, 'Missing sheetId or newName');
        const { db } = await import('@uniconnect/shared');
        await db.query('UPDATE sheet_connections SET sheet_name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [newName.trim(), sheetId, locals.user.id]);
        return json({ ok: true });
    }

    // Get sharing info for a sheet (who it's shared with)
    if (action === 'sharing-info') {
        const { sheetId } = body;
        if (!sheetId) throw error(400, 'Missing sheetId');

        const creds = await getSheetConnectionCredentials(sheetId);
        if (!creds) throw error(404, 'Sheet connection not found');

        try {
            const refreshToken = decryptString(creds.refresh_token_enc);
            const { google } = await import('googleapis');
            const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID?.trim(), env.GOOGLE_CLIENT_SECRET?.trim());
            auth.setCredentials({ refresh_token: refreshToken });
            const drive = google.drive({ version: 'v3', auth });
            const permsRes = await drive.permissions.list({
                fileId: creds.spreadsheet_id,
                fields: 'permissions(id,emailAddress,role,displayName,type)'
            });
            const permissions = permsRes.data.permissions || [];
            // Also update shared_emails in background
            const sharedEmails = permissions
                .filter((p: any) => p.emailAddress && p.type === 'user')
                .map((p: any) => p.emailAddress.toLowerCase());
            updateSheetSharedEmails(sheetId, sharedEmails);
            return json({ permissions, connectedAs: creds.google_email });
        } catch (err: any) {
            return json({ permissions: [], connectedAs: creds.google_email, error: 'Drive API access not available. Sheet is connected via: ' + creds.google_email });
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
