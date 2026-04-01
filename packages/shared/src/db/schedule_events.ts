import { db } from './client';

export type ScheduleEventType = 'HOLIDAY' | 'EXAM' | 'EVENT' | 'CURRICULAR' | 'CO_CURRICULAR' | 'CLUB_ACTIVITY' | 'CULTURAL_ACTIVITY';

export interface ScheduleEvent {
    id: string;
    university_id: string;
    title: string;
    type: ScheduleEventType;
    description: string | null;
    priority: string | null;
    start_date: Date;
    due_date: Date;
    created_by: string | null;
    created_at: Date;
    assignee_ids?: string[];
}

// ─── Auto-migration for new columns & tables ──────────────────────────────
let _eventMigrated = false;
async function ensureEventSchema() {
    if (_eventMigrated) return;
    try {
        // Add new columns to schedule_events
        await db.query(`ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'MEDIUM'`);
        // Event assignees junction table
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_assignees (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT DEFAULT 'ASSIGNED',
                assigned_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(event_id, user_id)
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_assignees_event ON event_assignees(event_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_assignees_user ON event_assignees(user_id)`);
        // Event checklist items table
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_checklist_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_by UUID REFERENCES users(id),
                completed_at TIMESTAMPTZ,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_checklist_event ON event_checklist_items(event_id)`);
        // Event view logs table
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_view_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_at TIMESTAMPTZ DEFAULT NOW(),
                duration_seconds INTEGER DEFAULT 0,
                session_id TEXT
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_view_event ON event_view_logs(event_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_view_user ON event_view_logs(user_id)`);
        // SOP documents table
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_sop_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                content_text TEXT,
                content_html TEXT,
                uploaded_by UUID REFERENCES users(id),
                uploaded_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Add content_html column if missing (migration for existing tables)
        await db.query(`
            ALTER TABLE event_sop_documents ADD COLUMN IF NOT EXISTS content_html TEXT
        `).catch(() => {});
        // Event messages table (extracted from SOPs or manually added)
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                is_sent BOOLEAN DEFAULT FALSE,
                sent_by UUID REFERENCES users(id),
                sent_at TIMESTAMPTZ,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_event_messages_event ON event_messages(event_id)`);
        // Calendar freeze table
        await db.query(`
            CREATE TABLE IF NOT EXISTS calendar_freezes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                freeze_date DATE NOT NULL,
                reason TEXT,
                frozen_by UUID NOT NULL REFERENCES users(id),
                frozen_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(university_id, freeze_date)
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_calendar_freeze_univ ON calendar_freezes(university_id)`);

        // ─── Phase 2 migrations: section columns, status, reports, event_id on tasks ───
        await db.query(`ALTER TABLE event_checklist_items ADD COLUMN IF NOT EXISTS section TEXT DEFAULT ''`);
        await db.query(`ALTER TABLE event_checklist_items ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT ''`);
        await db.query(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS section TEXT DEFAULT ''`);
        await db.query(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT ''`);
        await db.query(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS scheduled_time TEXT DEFAULT ''`);
        await db.query(`ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE'`);
        // Link tasks to events
        await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_id UUID`).catch(() => {});
        await db.query(`CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id)`).catch(() => {});
        // Event reports table
        await db.query(`
            CREATE TABLE IF NOT EXISTS event_reports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
                university_id UUID NOT NULL,
                event_start_date DATE,
                event_end_date DATE,
                campus_name TEXT,
                conducted_by TEXT,
                cma_assigned TEXT,
                event_category TEXT,
                event_subcategory TEXT,
                event_title TEXT,
                event_duration_days INTEGER DEFAULT 1,
                event_mode TEXT DEFAULT 'Offline',
                event_description TEXT,
                num_registrations INTEGER DEFAULT 0,
                num_participants INTEGER DEFAULT 0,
                feedback_response_rate TEXT,
                avg_feedback_rating NUMERIC(3,2) DEFAULT 0,
                event_feedback TEXT,
                highlights TEXT,
                suggested_improvements TEXT,
                event_photos_link TEXT,
                registration_form_link TEXT,
                feedback_form_link TEXT,
                event_recording_link TEXT,
                loaded_to_zoho BOOLEAN DEFAULT FALSE,
                submitted_by UUID REFERENCES users(id),
                submitted_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(event_id)
            )
        `);
        // Backfill: extract [Section] prefix from checklist title into section column
        await db.query(`
            UPDATE event_checklist_items
            SET section = substring(title from '\\[([^\\]]+)\\]'),
                title = trim(regexp_replace(title, '^\\[[^\\]]+\\]\\s*', ''))
            WHERE title ~ '^\\[' AND (section IS NULL OR section = '')
        `).catch(() => {});

        _eventMigrated = true;
    } catch (e: any) {
        console.error('[ensureEventSchema]', e.message);
        _eventMigrated = true;
    }
}

// ─── Schedule Events CRUD ─────────────────────────────────────────────────

export async function createScheduleEvent(data: {
    university_id: string;
    title: string;
    type: ScheduleEventType;
    description?: string;
    priority?: string;
    start_date: string;
    due_date: string;
    created_by: string;
    assignee_ids?: string[];
}) {
    await ensureEventSchema();
    const result = await db.query(
        `INSERT INTO schedule_events (university_id, title, type, description, priority, start_date, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [data.university_id, data.title, data.type, data.description || null, data.priority || 'MEDIUM', data.start_date, data.due_date, data.created_by]
    );
    const event = result.rows[0] as ScheduleEvent;
    // Insert assignees in parallel
    if (data.assignee_ids && data.assignee_ids.length > 0) {
        await Promise.all(data.assignee_ids.map(uid =>
            db.query(`INSERT INTO event_assignees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [event.id, uid])
        ));
        event.assignee_ids = data.assignee_ids;
    }
    return event;
}

export async function getScheduleEvents(universityId?: string) {
    await ensureEventSchema();
    const whereClause = universityId ? `WHERE se.university_id = $1` : ``;
    const params = universityId ? [universityId] : [];
    const result = await db.query(
        `SELECT se.*,
            COALESCE(
                json_agg(json_build_object('id', ea.user_id, 'name', u.name, 'email', u.email))
                FILTER (WHERE ea.user_id IS NOT NULL), '[]'
            ) as assignees
         FROM schedule_events se
         LEFT JOIN event_assignees ea ON ea.event_id = se.id
         LEFT JOIN users u ON u.id = ea.user_id
         ${whereClause}
         GROUP BY se.id
         ORDER BY se.start_date ASC`,
        params
    );
    return result.rows;
}

export async function getScheduleEventById(id: string) {
    await ensureEventSchema();
    const result = await db.query(
        `SELECT se.*,
            COALESCE(
                json_agg(json_build_object('id', ea.user_id, 'name', u.name, 'email', u.email))
                FILTER (WHERE ea.user_id IS NOT NULL), '[]'
            ) as assignees
         FROM schedule_events se
         LEFT JOIN event_assignees ea ON ea.event_id = se.id
         LEFT JOIN users u ON u.id = ea.user_id
         WHERE se.id = $1
         GROUP BY se.id`,
        [id]
    );
    return result.rows[0] || null;
}

export async function updateScheduleEvent(id: string, data: Partial<{ title: string; type: string; description: string; priority: string; start_date: string; due_date: string; assignee_ids: string[] }>) {
    await ensureEventSchema();
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
        if (key === 'assignee_ids') continue;
        sets.push(`${key} = $${idx++}`);
        vals.push(val);
    }
    if (sets.length > 0) {
        vals.push(id);
        await db.query(`UPDATE schedule_events SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    }
    if (data.assignee_ids) {
        await db.query(`DELETE FROM event_assignees WHERE event_id = $1`, [id]);
        for (const uid of data.assignee_ids) {
            await db.query(
                `INSERT INTO event_assignees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [id, uid]
            );
        }
    }
}

export async function deleteScheduleEvent(id: string) {
    await ensureEventSchema();
    await db.query(`DELETE FROM schedule_events WHERE id = $1`, [id]);
}

// ─── Event Checklist ──────────────────────────────────────────────────────

export async function getEventChecklistItems(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT ci.*, u.name as completed_by_name
         FROM event_checklist_items ci
         LEFT JOIN users u ON ci.completed_by = u.id
         WHERE ci.event_id = $1
         ORDER BY ci.sort_order ASC, ci.created_at ASC`,
        [eventId]
    );
    return res.rows;
}

export async function addEventChecklistItem(eventId: string, title: string, sortOrder?: number) {
    await ensureEventSchema();
    const order = sortOrder ?? (await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM event_checklist_items WHERE event_id = $1`,
        [eventId]
    )).rows[0].next;
    const res = await db.query(
        `INSERT INTO event_checklist_items (event_id, title, sort_order)
         VALUES ($1, $2, $3) RETURNING *`,
        [eventId, title, order]
    );
    return res.rows[0];
}

export async function addEventChecklistItemsBulk(eventId: string, items: (string | { title: string; section?: string; owner?: string })[]) {
    await ensureEventSchema();
    if (items.length === 0) return [];
    const values: string[] = [];
    const params: any[] = [eventId];
    for (let i = 0; i < items.length; i++) {
        const item = typeof items[i] === 'string' ? { title: items[i] as string, section: '', owner: '' } : items[i] as { title: string; section?: string; owner?: string };
        params.push(item.title, item.section || '', item.owner || '', i + 1);
        values.push(`($1, $${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length})`);
    }
    const res = await db.query(
        `INSERT INTO event_checklist_items (event_id, title, section, owner, sort_order)
         VALUES ${values.join(', ')} RETURNING *`,
        params
    );
    return res.rows;
}

export async function toggleEventChecklistItem(itemId: string, userId: string) {
    await ensureEventSchema();
    const current = await db.query(`SELECT is_completed FROM event_checklist_items WHERE id = $1`, [itemId]);
    if (!current.rows[0]) return null;
    const wasCompleted = current.rows[0].is_completed;
    const res = await db.query(
        `UPDATE event_checklist_items SET
            is_completed = $2,
            completed_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
            completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [itemId, !wasCompleted, userId]
    );
    return res.rows[0];
}

export async function deleteEventChecklistItem(itemId: string) {
    await ensureEventSchema();
    await db.query(`DELETE FROM event_checklist_items WHERE id = $1`, [itemId]);
}

export async function getEventChecklistProgress(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_completed) as completed
         FROM event_checklist_items WHERE event_id = $1`,
        [eventId]
    );
    const row = res.rows[0];
    return {
        total: parseInt(row.total),
        completed: parseInt(row.completed),
        percent: parseInt(row.total) > 0 ? Math.round((parseInt(row.completed) / parseInt(row.total)) * 100) : 0
    };
}

// ─── Event View Tracking ──────────────────────────────────────────────────

export async function logEventView(eventId: string, userId: string, sessionId?: string) {
    await ensureEventSchema();
    const res = await db.query(
        `INSERT INTO event_view_logs (event_id, user_id, session_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [eventId, userId, sessionId || null]
    );
    return res.rows[0];
}

export async function updateEventViewDuration(viewLogId: string, durationSeconds: number) {
    await ensureEventSchema();
    await db.query(`UPDATE event_view_logs SET duration_seconds = $2 WHERE id = $1`, [viewLogId, durationSeconds]);
}

export async function getEventViewStats(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT
            u.id as user_id, u.name as user_name, u.email as user_email,
            COUNT(*) as view_count,
            SUM(vl.duration_seconds) as total_duration_seconds,
            MAX(vl.viewed_at) as last_viewed_at,
            MIN(vl.viewed_at) as first_viewed_at
         FROM event_view_logs vl
         JOIN users u ON vl.user_id = u.id
         WHERE vl.event_id = $1
         GROUP BY u.id, u.name, u.email
         ORDER BY last_viewed_at DESC`,
        [eventId]
    );
    return res.rows;
}

// ─── SOP Documents ────────────────────────────────────────────────────────

export async function addSOPDocument(eventId: string, filename: string, contentText: string, uploadedBy: string, contentHtml?: string) {
    await ensureEventSchema();
    const res = await db.query(
        `INSERT INTO event_sop_documents (event_id, filename, content_text, content_html, uploaded_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [eventId, filename, contentText, contentHtml || null, uploadedBy]
    );
    return res.rows[0];
}

export async function getSOPDocuments(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT d.*, u.name as uploaded_by_name
         FROM event_sop_documents d
         LEFT JOIN users u ON d.uploaded_by = u.id
         WHERE d.event_id = $1
         ORDER BY d.uploaded_at DESC`,
        [eventId]
    );
    return res.rows;
}

export async function deleteSOPDocument(docId: string) {
    await ensureEventSchema();
    await db.query(`DELETE FROM event_sop_documents WHERE id = $1`, [docId]);
}

// ─── Event Messages ───────────────────────────────────────────────────────

export async function getEventMessages(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT m.*, u.name as sent_by_name
         FROM event_messages m
         LEFT JOIN users u ON m.sent_by = u.id
         WHERE m.event_id = $1
         ORDER BY m.sort_order ASC, m.created_at ASC`,
        [eventId]
    );
    return res.rows;
}

export async function addEventMessage(eventId: string, title: string, content: string, sortOrder?: number) {
    await ensureEventSchema();
    const order = sortOrder ?? (await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM event_messages WHERE event_id = $1`,
        [eventId]
    )).rows[0].next;
    const res = await db.query(
        `INSERT INTO event_messages (event_id, title, content, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [eventId, title, content, order]
    );
    return res.rows[0];
}

export async function addEventMessagesBulk(eventId: string, messages: { title: string; content: string; section?: string; channel?: string; scheduled_time?: string }[]) {
    await ensureEventSchema();
    if (messages.length === 0) return [];
    const values: string[] = [];
    const params: any[] = [eventId];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        params.push(m.title, m.content, m.section || '', m.channel || '', m.scheduled_time || '', i + 1);
        values.push(`($1, $${params.length - 5}, $${params.length - 4}, $${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length})`);
    }
    const res = await db.query(
        `INSERT INTO event_messages (event_id, title, content, section, channel, scheduled_time, sort_order)
         VALUES ${values.join(', ')} RETURNING *`,
        params
    );
    return res.rows;
}

export async function toggleEventMessageSent(messageId: string, userId: string) {
    await ensureEventSchema();
    const current = await db.query(`SELECT is_sent FROM event_messages WHERE id = $1`, [messageId]);
    if (!current.rows[0]) return null;
    const wasSent = current.rows[0].is_sent;
    const res = await db.query(
        `UPDATE event_messages SET
            is_sent = $2,
            sent_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
            sent_at = CASE WHEN $2 THEN NOW() ELSE NULL END
         WHERE id = $1 RETURNING *`,
        [messageId, !wasSent, userId]
    );
    return res.rows[0];
}

export async function deleteEventMessage(messageId: string) {
    await ensureEventSchema();
    await db.query(`DELETE FROM event_messages WHERE id = $1`, [messageId]);
}

// ─── Calendar Freeze ──────────────────────────────────────────────────────

export async function freezeCalendarDate(universityId: string, freezeDate: string, reason: string, frozenBy: string) {
    await ensureEventSchema();
    const res = await db.query(
        `INSERT INTO calendar_freezes (university_id, freeze_date, reason, frozen_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (university_id, freeze_date) DO UPDATE SET reason = $3, frozen_by = $4, frozen_at = NOW()
         RETURNING *`,
        [universityId, freezeDate, reason, frozenBy]
    );
    return res.rows[0];
}

export async function unfreezeCalendarDate(id: string) {
    await ensureEventSchema();
    await db.query(`DELETE FROM calendar_freezes WHERE id = $1`, [id]);
}

export async function getCalendarFreezes(universityId?: string) {
    await ensureEventSchema();
    const where = universityId ? `WHERE cf.university_id = $1` : '';
    const params = universityId ? [universityId] : [];
    const res = await db.query(
        `SELECT cf.*, u.name as frozen_by_name, univ.name as university_name
         FROM calendar_freezes cf
         JOIN users u ON cf.frozen_by = u.id
         JOIN universities univ ON cf.university_id = univ.id
         ${where}
         ORDER BY cf.freeze_date ASC`,
        params
    );
    return res.rows;
}

export async function getCalendarFreezesForDateRange(startDate: string, endDate: string, universityId?: string) {
    await ensureEventSchema();
    let query = `SELECT cf.*, u.name as frozen_by_name, univ.name as university_name
         FROM calendar_freezes cf
         JOIN users u ON cf.frozen_by = u.id
         JOIN universities univ ON cf.university_id = univ.id
         WHERE cf.freeze_date >= $1 AND cf.freeze_date <= $2`;
    const params: any[] = [startDate, endDate];
    if (universityId) {
        query += ` AND cf.university_id = $3`;
        params.push(universityId);
    }
    query += ` ORDER BY cf.freeze_date ASC`;
    const res = await db.query(query, params);
    return res.rows;
}

// ─── Section-level Checklist Progress ────────────────────────────────────

export async function getEventChecklistProgressBySection(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT COALESCE(section, '') as section,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_completed) as completed
         FROM event_checklist_items
         WHERE event_id = $1
         GROUP BY COALESCE(section, '')
         ORDER BY MIN(sort_order)`,
        [eventId]
    );
    return res.rows.map((r: any) => ({
        section: r.section || 'General',
        total: parseInt(r.total),
        completed: parseInt(r.completed),
    }));
}

// ─── Event Completion ────────────────────────────────────────────────────

export async function updateEventStatus(eventId: string, status: string) {
    await ensureEventSchema();
    await db.query(`UPDATE schedule_events SET status = $2 WHERE id = $1`, [eventId, status]);
}

export async function checkAndCompleteEvent(eventId: string): Promise<boolean> {
    await ensureEventSchema();
    const progress = await getEventChecklistProgress(eventId);
    if (progress.total > 0 && progress.completed === progress.total) {
        const current = await db.query(`SELECT status FROM schedule_events WHERE id = $1`, [eventId]);
        if (current.rows[0]?.status !== 'COMPLETED') {
            await updateEventStatus(eventId, 'COMPLETED');
            return true; // just transitioned to completed
        }
    } else {
        // If items were unchecked, revert to ACTIVE
        const current = await db.query(`SELECT status FROM schedule_events WHERE id = $1`, [eventId]);
        if (current.rows[0]?.status === 'COMPLETED') {
            await updateEventStatus(eventId, 'ACTIVE');
        }
    }
    return false;
}

// ─── Event Reports ───────────────────────────────────────────────────────

export async function createEventReport(data: any) {
    await ensureEventSchema();
    const res = await db.query(
        `INSERT INTO event_reports (
            event_id, university_id, event_start_date, event_end_date,
            campus_name, conducted_by, cma_assigned, event_category, event_subcategory,
            event_title, event_duration_days, event_mode, event_description,
            num_registrations, num_participants, feedback_response_rate, avg_feedback_rating,
            event_feedback, highlights, suggested_improvements,
            event_photos_link, registration_form_link, feedback_form_link, event_recording_link,
            loaded_to_zoho, submitted_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        ON CONFLICT (event_id) DO UPDATE SET
            event_start_date = EXCLUDED.event_start_date, event_end_date = EXCLUDED.event_end_date,
            campus_name = EXCLUDED.campus_name, conducted_by = EXCLUDED.conducted_by,
            cma_assigned = EXCLUDED.cma_assigned, event_category = EXCLUDED.event_category,
            event_subcategory = EXCLUDED.event_subcategory, event_title = EXCLUDED.event_title,
            event_duration_days = EXCLUDED.event_duration_days, event_mode = EXCLUDED.event_mode,
            event_description = EXCLUDED.event_description, num_registrations = EXCLUDED.num_registrations,
            num_participants = EXCLUDED.num_participants, feedback_response_rate = EXCLUDED.feedback_response_rate,
            avg_feedback_rating = EXCLUDED.avg_feedback_rating, event_feedback = EXCLUDED.event_feedback,
            highlights = EXCLUDED.highlights, suggested_improvements = EXCLUDED.suggested_improvements,
            event_photos_link = EXCLUDED.event_photos_link, registration_form_link = EXCLUDED.registration_form_link,
            feedback_form_link = EXCLUDED.feedback_form_link, event_recording_link = EXCLUDED.event_recording_link,
            loaded_to_zoho = EXCLUDED.loaded_to_zoho, updated_at = NOW()
        RETURNING *`,
        [
            data.event_id, data.university_id, data.event_start_date || null, data.event_end_date || null,
            data.campus_name || null, data.conducted_by || null, data.cma_assigned || null,
            data.event_category || null, data.event_subcategory || null, data.event_title || null,
            data.event_duration_days || 1, data.event_mode || 'Offline', data.event_description || null,
            data.num_registrations || 0, data.num_participants || 0,
            data.feedback_response_rate || null, data.avg_feedback_rating || 0,
            data.event_feedback || null, data.highlights || null, data.suggested_improvements || null,
            data.event_photos_link || null, data.registration_form_link || null,
            data.feedback_form_link || null, data.event_recording_link || null,
            data.loaded_to_zoho || false, data.submitted_by || null
        ]
    );
    return res.rows[0];
}

export async function getEventReport(eventId: string) {
    await ensureEventSchema();
    const res = await db.query(
        `SELECT er.*, u.name as submitted_by_name
         FROM event_reports er
         LEFT JOIN users u ON er.submitted_by = u.id
         WHERE er.event_id = $1`,
        [eventId]
    );
    return res.rows[0] || null;
}

export async function getEventReports(universityId?: string) {
    await ensureEventSchema();
    const where = universityId ? `WHERE er.university_id = $1` : '';
    const params = universityId ? [universityId] : [];
    const res = await db.query(
        `SELECT er.*, u.name as submitted_by_name, se.title as event_name
         FROM event_reports er
         LEFT JOIN users u ON er.submitted_by = u.id
         LEFT JOIN schedule_events se ON er.event_id = se.id
         ${where}
         ORDER BY er.submitted_at DESC`,
        params
    );
    return res.rows;
}

// ─── Auto-Task Creation from Event Checklists ────────────────────────────

export async function createTasksFromEventChecklist(eventId: string, assigneeIds: string[], createdBy: string) {
    await ensureEventSchema();
    const event = await getScheduleEventById(eventId);
    if (!event) throw new Error('Event not found');

    const items = await getEventChecklistItems(eventId);
    if (items.length === 0) return [];

    // Group by section
    const sections = new Map<string, any[]>();
    for (const item of items) {
        const sec = item.section || 'General';
        if (!sections.has(sec)) sections.set(sec, []);
        sections.get(sec)!.push(item);
    }

    const createdTasks: any[] = [];
    for (const [section, sectionItems] of sections) {
        const description = sectionItems.map((it: any) => {
            const ownerStr = it.owner ? ` (Owner: ${it.owner})` : '';
            return `- ${it.title}${ownerStr}`;
        }).join('\n');
        const taskResult = await db.query(
            `INSERT INTO tasks (title, description, priority, status, due_date, assigned_by, university_id, event_id)
             VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7) RETURNING *`,
            [
                `${event.title} — ${section}`,
                description,
                event.priority || 'MEDIUM',
                event.due_date,
                createdBy,
                event.university_id,
                eventId
            ]
        );
        const task = taskResult.rows[0];
        // Assign to all event assignees
        for (const uid of assigneeIds) {
            await db.query(
                `INSERT INTO task_assignees (task_id, user_id, status) VALUES ($1, $2, 'PENDING') ON CONFLICT DO NOTHING`,
                [task.id, uid]
            ).catch(() => {});
        }
        createdTasks.push(task);
    }
    return createdTasks;
}
