-- Google Sheets integration: store connected sheets and synced data
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

-- Store synced sheet data (each sync stores a snapshot)
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
