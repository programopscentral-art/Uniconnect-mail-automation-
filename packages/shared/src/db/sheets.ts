import { db } from './client';

// ─── Types ───────────────────────────────────────────────────────────

export interface SheetConnection {
    id: string;
    user_id: string;
    university_id: string | null;
    sheet_name: string;
    sheet_url: string;
    spreadsheet_id: string;
    google_email: string;
    scopes: string;
    status: 'ACTIVE' | 'REVOKED' | 'ERROR';
    visibility: 'private' | 'auto' | 'university';
    shared_emails: string[];
    last_synced_at: Date | null;
    sync_error: string | null;
    created_at: Date;
    updated_at: Date;
    // Computed fields from query
    is_owner?: boolean;
    owner_name?: string;
    tabs?: any;
}

export interface SheetSyncData {
    id: string;
    sheet_connection_id: string;
    sheet_tab: string;
    headers: string[];
    rows: any[][];
    row_count: number;
    col_count: number;
    synced_at: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────

export async function ensureSheetSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS sheet_connections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            university_id UUID REFERENCES universities(id) ON DELETE SET NULL,
            sheet_name TEXT NOT NULL,
            sheet_url TEXT NOT NULL,
            spreadsheet_id TEXT NOT NULL,
            refresh_token_enc TEXT NOT NULL,
            google_email TEXT NOT NULL,
            scopes TEXT NOT NULL DEFAULT 'spreadsheets.readonly',
            status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'ERROR')),
            last_synced_at TIMESTAMPTZ,
            sync_error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, spreadsheet_id)
        );

        CREATE TABLE IF NOT EXISTS sheet_sync_data (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sheet_connection_id UUID NOT NULL REFERENCES sheet_connections(id) ON DELETE CASCADE,
            sheet_tab TEXT NOT NULL DEFAULT 'Sheet1',
            headers JSONB NOT NULL DEFAULT '[]',
            rows JSONB NOT NULL DEFAULT '[]',
            row_count INTEGER NOT NULL DEFAULT 0,
            col_count INTEGER NOT NULL DEFAULT 0,
            synced_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_sheet_connections_user ON sheet_connections(user_id);
        CREATE INDEX IF NOT EXISTS idx_sheet_connections_university ON sheet_connections(university_id);
        CREATE INDEX IF NOT EXISTS idx_sheet_sync_data_connection ON sheet_sync_data(sheet_connection_id);
        CREATE INDEX IF NOT EXISTS idx_sheet_sync_data_synced ON sheet_sync_data(synced_at DESC);

        -- Add tabs column if not exists
        ALTER TABLE sheet_connections ADD COLUMN IF NOT EXISTS tabs JSONB DEFAULT '[]';

        -- Add visibility and shared_emails columns for auto-sharing
        ALTER TABLE sheet_connections ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'auto' CHECK (visibility IN ('private', 'auto', 'university'));
        ALTER TABLE sheet_connections ADD COLUMN IF NOT EXISTS shared_emails JSONB DEFAULT '[]';
    `);
}

// ─── Sheet Connections ───────────────────────────────────────────────

export async function createSheetConnection(data: {
    user_id: string;
    university_id?: string;
    sheet_name: string;
    sheet_url: string;
    spreadsheet_id: string;
    refresh_token_enc: string;
    google_email: string;
    scopes?: string;
}): Promise<SheetConnection> {
    const result = await db.query(
        `INSERT INTO sheet_connections (user_id, university_id, sheet_name, sheet_url, spreadsheet_id, refresh_token_enc, google_email, scopes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         ON CONFLICT (user_id, spreadsheet_id) DO UPDATE SET
            sheet_name = EXCLUDED.sheet_name,
            sheet_url = EXCLUDED.sheet_url,
            refresh_token_enc = EXCLUDED.refresh_token_enc,
            google_email = EXCLUDED.google_email,
            scopes = EXCLUDED.scopes,
            university_id = EXCLUDED.university_id,
            status = 'ACTIVE',
            sync_error = NULL,
            updated_at = NOW()
         RETURNING *`,
        [data.user_id, data.university_id || null, data.sheet_name, data.sheet_url, data.spreadsheet_id, data.refresh_token_enc, data.google_email, data.scopes || 'spreadsheets.readonly']
    );
    return result.rows[0];
}

export async function getSheetConnections(userId: string, userEmail?: string): Promise<SheetConnection[]> {
    // Get own sheets + sheets shared with this user's email via Google Sheets
    const emailLower = (userEmail || '').toLowerCase();
    const result = await db.query(
        `SELECT sc.*, u.name as university_name,
            CASE WHEN sc.user_id = $1 THEN true ELSE false END as is_owner,
            (SELECT usr.name FROM users usr WHERE usr.id = sc.user_id LIMIT 1) as owner_name
         FROM sheet_connections sc
         LEFT JOIN universities u ON sc.university_id = u.id
         WHERE sc.status != 'REVOKED'
           AND (
               sc.user_id = $1
               OR (sc.visibility != 'private' AND $2 != '' AND sc.shared_emails ? $2)
               OR (sc.visibility = 'university' AND sc.university_id = (SELECT university_id FROM users WHERE id = $1))
           )
         ORDER BY sc.updated_at DESC`,
        [userId, emailLower]
    );
    return result.rows;
}

export async function getSheetConnection(id: string): Promise<SheetConnection | null> {
    const result = await db.query(`SELECT * FROM sheet_connections WHERE id = $1`, [id]);
    return result.rows[0] || null;
}

export async function getSheetConnectionCredentials(id: string) {
    const result = await db.query(
        `SELECT id, user_id, spreadsheet_id, refresh_token_enc, google_email, scopes FROM sheet_connections WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

export async function updateSheetSyncStatus(id: string, status: 'ACTIVE' | 'ERROR', error?: string, tabs?: Array<string | { name: string; gid: number }>) {
    if (tabs) {
        await db.query(
            `UPDATE sheet_connections SET
                status = $2,
                sync_error = $3,
                tabs = $4,
                last_synced_at = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE last_synced_at END,
                updated_at = NOW()
             WHERE id = $1`,
            [id, status, error || null, JSON.stringify(tabs)]
        );
    } else {
        await db.query(
            `UPDATE sheet_connections SET
                status = $2,
                sync_error = $3,
                last_synced_at = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE last_synced_at END,
                updated_at = NOW()
             WHERE id = $1`,
            [id, status, error || null]
        );
    }
}

export async function deleteSheetConnection(id: string, userId: string) {
    await db.query(
        `UPDATE sheet_connections SET status = 'REVOKED', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
}

export async function updateSheetSharedEmails(id: string, emails: string[]) {
    await db.query(
        `UPDATE sheet_connections SET shared_emails = $2, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(emails)]
    );
}

// ─── Sheet Sync Data ─────────────────────────────────────────────────

export async function saveSheetSyncData(data: {
    sheet_connection_id: string;
    sheet_tab: string;
    headers: string[];
    rows: any[][];
}): Promise<SheetSyncData> {
    const result = await db.query(
        `INSERT INTO sheet_sync_data (sheet_connection_id, sheet_tab, headers, rows, row_count, col_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [data.sheet_connection_id, data.sheet_tab, JSON.stringify(data.headers), JSON.stringify(data.rows), data.rows.length, data.headers.length]
    );
    return result.rows[0];
}

export async function getLatestSheetSyncData(sheetConnectionId: string, sheetTab?: string): Promise<SheetSyncData | null> {
    const query = sheetTab
        ? `SELECT * FROM sheet_sync_data WHERE sheet_connection_id = $1 AND sheet_tab = $2 ORDER BY synced_at DESC LIMIT 1`
        : `SELECT * FROM sheet_sync_data WHERE sheet_connection_id = $1 ORDER BY synced_at DESC LIMIT 1`;
    const params = sheetTab ? [sheetConnectionId, sheetTab] : [sheetConnectionId];
    const result = await db.query(query, params);
    return result.rows[0] || null;
}

export async function getSheetSyncHistory(sheetConnectionId: string, limit = 10): Promise<SheetSyncData[]> {
    const result = await db.query(
        `SELECT id, sheet_connection_id, sheet_tab, row_count, col_count, synced_at
         FROM sheet_sync_data WHERE sheet_connection_id = $1 ORDER BY synced_at DESC LIMIT $2`,
        [sheetConnectionId, limit]
    );
    return result.rows;
}

// ─── Cleanup ─────────────────────────────────────────────────────────

export async function cleanupOldSyncData(keepCount = 5) {
    // Keep only the latest N syncs per sheet connection
    await db.query(`
        DELETE FROM sheet_sync_data WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY sheet_connection_id ORDER BY synced_at DESC) as rn
                FROM sheet_sync_data
            ) ranked WHERE rn > $1
        )
    `, [keepCount]);
}
