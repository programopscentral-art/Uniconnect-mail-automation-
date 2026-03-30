-- Meeting Intelligence: Track and analyze Google Meet meetings

-- Stores connected accounts that have Calendar/Drive/Docs access for meeting monitoring
CREATE TABLE IF NOT EXISTS meeting_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    scopes TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
    connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

-- Core meetings table
CREATE TABLE IF NOT EXISTS org_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
    meeting_connection_id UUID REFERENCES meeting_connections(id) ON DELETE SET NULL,

    -- Google identifiers
    google_event_id TEXT,
    google_meet_code TEXT,
    google_calendar_id TEXT DEFAULT 'primary',

    -- Meeting info
    title TEXT NOT NULL,
    description TEXT,
    organizer_email TEXT NOT NULL,
    organizer_name TEXT,
    meet_link TEXT,

    -- Timing
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    duration_minutes INTEGER,

    -- Source: how we discovered this meeting
    source TEXT DEFAULT 'CALENDAR' CHECK (source IN ('CALENDAR', 'DRIVE_SCAN', 'MANUAL')),

    -- Processing state
    status TEXT DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'PROCESSING', 'COMPLETED', 'FAILED', 'NO_DATA')),
    processing_error TEXT,

    -- Google Drive artifacts
    transcript_doc_id TEXT,
    transcript_doc_url TEXT,
    recording_file_id TEXT,
    recording_url TEXT,
    attendance_file_id TEXT,

    -- Parsed data
    raw_transcript TEXT,
    participant_count INTEGER DEFAULT 0,

    -- AI-generated report
    ai_summary TEXT,
    ai_action_items JSONB DEFAULT '[]',
    ai_key_decisions JSONB DEFAULT '[]',
    ai_topics JSONB DEFAULT '[]',
    ai_sentiment TEXT,
    ai_processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- People invited to the meeting (from Calendar)
CREATE TABLE IF NOT EXISTS org_meeting_invitees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES org_meetings(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    response_status TEXT DEFAULT 'needsAction' CHECK (response_status IN ('needsAction', 'accepted', 'declined', 'tentative')),
    is_organizer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meeting_id, email)
);

-- People who actually participated (from transcript/attendance)
CREATE TABLE IF NOT EXISTS org_meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES org_meetings(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT NOT NULL,
    join_time TIMESTAMPTZ,
    leave_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    spoke_in_transcript BOOLEAN DEFAULT FALSE,
    speaking_segments INTEGER DEFAULT 0,
    source TEXT DEFAULT 'TRANSCRIPT' CHECK (source IN ('TRANSCRIPT', 'ATTENDANCE_CSV', 'MANUAL')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meeting_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_meetings_university ON org_meetings(university_id);
CREATE INDEX IF NOT EXISTS idx_org_meetings_status ON org_meetings(status);
CREATE INDEX IF NOT EXISTS idx_org_meetings_scheduled ON org_meetings(scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_org_meetings_organizer ON org_meetings(organizer_email);
CREATE INDEX IF NOT EXISTS idx_org_meetings_meet_code ON org_meetings(google_meet_code);
CREATE INDEX IF NOT EXISTS idx_org_meeting_invitees_meeting ON org_meeting_invitees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_org_meeting_participants_meeting ON org_meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_connections_university ON meeting_connections(university_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_org_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_meetings_updated ON org_meetings;
CREATE TRIGGER trg_org_meetings_updated
    BEFORE UPDATE ON org_meetings
    FOR EACH ROW EXECUTE FUNCTION update_org_meetings_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_connections_updated ON meeting_connections;
CREATE TRIGGER trg_meeting_connections_updated
    BEFORE UPDATE ON meeting_connections
    FOR EACH ROW EXECUTE FUNCTION update_org_meetings_updated_at();
