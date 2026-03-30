import { db } from './client';

// ─── Types ───────────────────────────────────────────────────────────

export interface MeetingConnection {
    id: string;
    user_id: string;
    email: string;
    status: 'ACTIVE' | 'REVOKED';
    scopes: string;
    connected_by: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface OrgMeeting {
    id: string;
    user_id: string;
    meeting_connection_id: string | null;
    google_event_id: string | null;
    google_meet_code: string | null;
    google_calendar_id: string;
    title: string;
    description: string | null;
    organizer_email: string;
    organizer_name: string | null;
    meet_link: string | null;
    scheduled_start: Date | null;
    scheduled_end: Date | null;
    actual_start: Date | null;
    actual_end: Date | null;
    duration_minutes: number | null;
    source: 'CALENDAR' | 'DRIVE_SCAN' | 'MANUAL';
    status: 'DISCOVERED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NO_DATA';
    processing_error: string | null;
    transcript_doc_id: string | null;
    transcript_doc_url: string | null;
    recording_file_id: string | null;
    recording_url: string | null;
    attendance_file_id: string | null;
    raw_transcript: string | null;
    participant_count: number;
    ai_summary: string | null;
    ai_action_items: any[];
    ai_key_decisions: any[];
    ai_topics: any[];
    ai_sentiment: string | null;
    ai_processed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    invitee_count?: number;
    actual_participant_count?: number;
}

export interface MeetingInvitee {
    id: string;
    meeting_id: string;
    email: string;
    name: string | null;
    response_status: 'needsAction' | 'accepted' | 'declined' | 'tentative';
    is_organizer: boolean;
    created_at: Date;
}

export interface MeetingParticipant {
    id: string;
    meeting_id: string;
    email: string | null;
    name: string;
    join_time: Date | null;
    leave_time: Date | null;
    duration_minutes: number | null;
    spoke_in_transcript: boolean;
    speaking_segments: number;
    source: 'TRANSCRIPT' | 'ATTENDANCE_CSV' | 'MANUAL';
    created_at: Date;
}

// ─── Meeting Connections ─────────────────────────────────────────────

export async function getMeetingConnections(userId?: string): Promise<MeetingConnection[]> {
    if (userId) {
        const result = await db.query(
            `SELECT id, user_id, email, status, scopes, connected_by, created_at, updated_at
             FROM meeting_connections WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    }
    const result = await db.query(
        `SELECT id, user_id, email, status, scopes, connected_by, created_at, updated_at
         FROM meeting_connections ORDER BY created_at DESC`
    );
    return result.rows;
}

export async function getActiveMeetingConnection(userId?: string): Promise<MeetingConnection | null> {
    const query = userId
        ? `SELECT * FROM meeting_connections WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`
        : `SELECT * FROM meeting_connections WHERE status = 'ACTIVE' LIMIT 1`;
    const params = userId ? [userId] : [];
    const result = await db.query(query, params);
    return result.rows[0] || null;
}

export async function createMeetingConnection(data: {
    user_id: string;
    email: string;
    refresh_token_enc: string;
    scopes: string;
    connected_by: string;
}): Promise<MeetingConnection> {
    const result = await db.query(
        `INSERT INTO meeting_connections (user_id, email, refresh_token_enc, scopes, connected_by, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         ON CONFLICT (user_id, email) DO UPDATE SET
            refresh_token_enc = EXCLUDED.refresh_token_enc,
            scopes = EXCLUDED.scopes,
            connected_by = EXCLUDED.connected_by,
            status = 'ACTIVE',
            updated_at = NOW()
         RETURNING id, user_id, email, status, scopes, connected_by, created_at, updated_at`,
        [data.user_id, data.email, data.refresh_token_enc, data.scopes, data.connected_by]
    );
    return result.rows[0];
}

export async function getMeetingConnectionCredentials(id: string) {
    const result = await db.query(`SELECT * FROM meeting_connections WHERE id = $1`, [id]);
    return result.rows[0];
}

export async function deleteMeetingConnection(id: string) {
    await db.query(`DELETE FROM meeting_connections WHERE id = $1`, [id]);
}

// ─── Meetings CRUD ───────────────────────────────────────────────────

export async function getMeetings(options: {
    userId?: string;
    status?: string;
    organizerEmail?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<{ meetings: OrgMeeting[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (options.userId) {
        conditions.push(`m.user_id = $${paramIdx++}`);
        params.push(options.userId);
    }
    if (options.status) {
        conditions.push(`m.status = $${paramIdx++}`);
        params.push(options.status);
    }
    if (options.organizerEmail) {
        conditions.push(`m.organizer_email = $${paramIdx++}`);
        params.push(options.organizerEmail);
    }
    if (options.startDate) {
        conditions.push(`m.scheduled_start >= $${paramIdx++}`);
        params.push(options.startDate);
    }
    if (options.endDate) {
        conditions.push(`m.scheduled_start <= $${paramIdx++}`);
        params.push(options.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [dataResult, countResult] = await Promise.all([
        db.query(
            `SELECT m.*,
                    (SELECT COUNT(*) FROM org_meeting_invitees WHERE meeting_id = m.id) as invitee_count,
                    (SELECT COUNT(*) FROM org_meeting_participants WHERE meeting_id = m.id) as actual_participant_count
             FROM org_meetings m
             ${where}
             ORDER BY m.scheduled_start DESC NULLS LAST
             LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            [...params, limit, offset]
        ),
        db.query(`SELECT COUNT(*) FROM org_meetings m ${where}`, params)
    ]);

    return {
        meetings: dataResult.rows,
        total: parseInt(countResult.rows[0].count)
    };
}

export async function getMeetingById(id: string): Promise<OrgMeeting | null> {
    const result = await db.query(
        `SELECT m.*,
                (SELECT COUNT(*) FROM org_meeting_invitees WHERE meeting_id = m.id) as invitee_count,
                (SELECT COUNT(*) FROM org_meeting_participants WHERE meeting_id = m.id) as actual_participant_count
         FROM org_meetings m WHERE m.id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

export async function getMeetingByGoogleEventId(googleEventId: string): Promise<OrgMeeting | null> {
    const result = await db.query(
        `SELECT * FROM org_meetings WHERE google_event_id = $1`,
        [googleEventId]
    );
    return result.rows[0] || null;
}

export async function getMeetingByMeetCode(meetCode: string): Promise<OrgMeeting | null> {
    const result = await db.query(
        `SELECT * FROM org_meetings WHERE google_meet_code = $1`,
        [meetCode]
    );
    return result.rows[0] || null;
}

export async function createMeeting(data: Partial<OrgMeeting>): Promise<OrgMeeting> {
    const result = await db.query(
        `INSERT INTO org_meetings (
            user_id, meeting_connection_id, google_event_id, google_meet_code,
            google_calendar_id, title, description, organizer_email, organizer_name,
            meet_link, scheduled_start, scheduled_end, source, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
            data.user_id, data.meeting_connection_id, data.google_event_id,
            data.google_meet_code, data.google_calendar_id || 'primary',
            data.title, data.description, data.organizer_email, data.organizer_name,
            data.meet_link, data.scheduled_start, data.scheduled_end,
            data.source || 'CALENDAR', data.status || 'DISCOVERED'
        ]
    );
    return result.rows[0];
}

export async function updateMeeting(id: string, updates: Record<string, any>): Promise<OrgMeeting> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'created_at') continue;
        setClauses.push(`${key} = $${paramIdx++}`);
        params.push(value);
    }

    params.push(id);
    const result = await db.query(
        `UPDATE org_meetings SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params
    );
    return result.rows[0];
}

export async function deleteMeeting(id: string) {
    await db.query(`DELETE FROM org_meetings WHERE id = $1`, [id]);
}

export async function clearMeetingParticipants(meetingId: string) {
    await db.query(`DELETE FROM org_meeting_participants WHERE meeting_id = $1`, [meetingId]);
}

// ─── Invitees ────────────────────────────────────────────────────────

export async function getMeetingInvitees(meetingId: string): Promise<MeetingInvitee[]> {
    const result = await db.query(
        `SELECT * FROM org_meeting_invitees WHERE meeting_id = $1 ORDER BY is_organizer DESC, email`,
        [meetingId]
    );
    return result.rows;
}

export async function upsertMeetingInvitee(data: {
    meeting_id: string;
    email: string;
    name?: string;
    response_status?: string;
    is_organizer?: boolean;
}): Promise<MeetingInvitee> {
    const result = await db.query(
        `INSERT INTO org_meeting_invitees (meeting_id, email, name, response_status, is_organizer)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id, email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, org_meeting_invitees.name),
            response_status = COALESCE(EXCLUDED.response_status, org_meeting_invitees.response_status),
            is_organizer = COALESCE(EXCLUDED.is_organizer, org_meeting_invitees.is_organizer)
         RETURNING *`,
        [data.meeting_id, data.email, data.name || null, data.response_status || 'needsAction', data.is_organizer || false]
    );
    return result.rows[0];
}

// ─── Participants ────────────────────────────────────────────────────

export async function getMeetingParticipants(meetingId: string): Promise<MeetingParticipant[]> {
    const result = await db.query(
        `SELECT * FROM org_meeting_participants WHERE meeting_id = $1 ORDER BY speaking_segments DESC, name`,
        [meetingId]
    );
    return result.rows;
}

export async function upsertMeetingParticipant(data: {
    meeting_id: string;
    email?: string;
    name: string;
    join_time?: Date;
    leave_time?: Date;
    duration_minutes?: number;
    spoke_in_transcript?: boolean;
    speaking_segments?: number;
    source?: string;
}): Promise<MeetingParticipant> {
    // Try to find existing by email first, then by name
    const existing = data.email
        ? await db.query(`SELECT id FROM org_meeting_participants WHERE meeting_id = $1 AND email = $2`, [data.meeting_id, data.email])
        : await db.query(`SELECT id FROM org_meeting_participants WHERE meeting_id = $1 AND name = $2 AND email IS NULL`, [data.meeting_id, data.name]);

    if (existing.rows.length > 0) {
        const result = await db.query(
            `UPDATE org_meeting_participants SET
                name = COALESCE($2, name),
                email = COALESCE($3, email),
                join_time = COALESCE($4, join_time),
                leave_time = COALESCE($5, leave_time),
                duration_minutes = COALESCE($6, duration_minutes),
                spoke_in_transcript = COALESCE($7, spoke_in_transcript),
                speaking_segments = GREATEST(speaking_segments, COALESCE($8, 0))
             WHERE id = $1 RETURNING *`,
            [existing.rows[0].id, data.name, data.email, data.join_time, data.leave_time,
             data.duration_minutes, data.spoke_in_transcript, data.speaking_segments]
        );
        return result.rows[0];
    }

    const result = await db.query(
        `INSERT INTO org_meeting_participants (meeting_id, email, name, join_time, leave_time, duration_minutes, spoke_in_transcript, speaking_segments, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [data.meeting_id, data.email, data.name, data.join_time, data.leave_time,
         data.duration_minutes, data.spoke_in_transcript ?? false, data.speaking_segments ?? 0,
         data.source || 'TRANSCRIPT']
    );
    return result.rows[0];
}

// ─── Stats ───────────────────────────────────────────────────────────

export async function getMeetingStats(userId?: string) {
    const where = userId ? `WHERE user_id = $1` : '';
    const params = userId ? [userId] : [];

    const result = await db.query(
        `SELECT
            COUNT(*) as total_meetings,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
            COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
            COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
            COUNT(*) FILTER (WHERE status = 'DISCOVERED') as discovered,
            COUNT(*) FILTER (WHERE ai_summary IS NOT NULL) as with_ai_report,
            COALESCE(AVG(participant_count) FILTER (WHERE participant_count > 0), 0) as avg_participants,
            COALESCE(AVG(duration_minutes) FILTER (WHERE duration_minutes > 0), 0) as avg_duration_minutes
         FROM org_meetings ${where}`,
        params
    );
    return result.rows[0];
}
