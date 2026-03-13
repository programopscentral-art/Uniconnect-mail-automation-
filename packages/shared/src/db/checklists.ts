import { db } from './client';

// ─── Auto-migration ─────────────────────────────────────────────────────────
let _migrated = false;
async function ensureChecklistTables() {
    if (_migrated) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS task_checklist_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_by UUID REFERENCES users(id),
                completed_at TIMESTAMPTZ,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS task_view_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_at TIMESTAMPTZ DEFAULT NOW(),
                duration_seconds INTEGER DEFAULT 0,
                session_id TEXT
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_view_log_task ON task_view_logs(task_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_view_log_user ON task_view_logs(user_id)`);
        _migrated = true;
    } catch (e: any) {
        console.error('[ensureChecklistTables]', e.message);
        _migrated = true;
    }
}

// ─── Checklist Items ─────────────────────────────────────────────────────────

export async function getChecklistItems(taskId: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `SELECT ci.*, u.name as completed_by_name
         FROM task_checklist_items ci
         LEFT JOIN users u ON ci.completed_by = u.id
         WHERE ci.task_id = $1
         ORDER BY ci.sort_order ASC, ci.created_at ASC`,
        [taskId]
    );
    return res.rows;
}

export async function addChecklistItem(taskId: string, title: string, sortOrder?: number) {
    await ensureChecklistTables();
    const order = sortOrder ?? (await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM task_checklist_items WHERE task_id = $1`,
        [taskId]
    )).rows[0].next;
    const res = await db.query(
        `INSERT INTO task_checklist_items (task_id, title, sort_order)
         VALUES ($1, $2, $3) RETURNING *`,
        [taskId, title, order]
    );
    return res.rows[0];
}

export async function addChecklistItemsBulk(taskId: string, items: string[]) {
    await ensureChecklistTables();
    if (items.length === 0) return [];
    const results = [];
    for (let i = 0; i < items.length; i++) {
        const res = await db.query(
            `INSERT INTO task_checklist_items (task_id, title, sort_order)
             VALUES ($1, $2, $3) RETURNING *`,
            [taskId, items[i], i + 1]
        );
        results.push(res.rows[0]);
    }
    return results;
}

export async function toggleChecklistItem(itemId: string, userId: string) {
    await ensureChecklistTables();
    const current = await db.query(`SELECT is_completed FROM task_checklist_items WHERE id = $1`, [itemId]);
    if (!current.rows[0]) return null;
    const wasCompleted = current.rows[0].is_completed;
    const res = await db.query(
        `UPDATE task_checklist_items SET
            is_completed = $2,
            completed_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
            completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [itemId, !wasCompleted, userId]
    );
    return res.rows[0];
}

export async function updateChecklistItem(itemId: string, title: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `UPDATE task_checklist_items SET title = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [itemId, title]
    );
    return res.rows[0];
}

export async function deleteChecklistItem(itemId: string) {
    await ensureChecklistTables();
    await db.query(`DELETE FROM task_checklist_items WHERE id = $1`, [itemId]);
}

export async function getChecklistProgress(taskId: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_completed) as completed
         FROM task_checklist_items WHERE task_id = $1`,
        [taskId]
    );
    const row = res.rows[0];
    return {
        total: parseInt(row.total),
        completed: parseInt(row.completed),
        percent: parseInt(row.total) > 0 ? Math.round((parseInt(row.completed) / parseInt(row.total)) * 100) : 0
    };
}

// ─── Auto-generate checklists from description ──────────────────────────────

export function generateChecklistFromDescription(description: string): string[] {
    if (!description || description.trim().length < 10) return [];
    const items: string[] = [];

    // Strategy 1: Extract numbered/bulleted items
    const listPattern = /(?:^|\n)\s*(?:\d+[.)]\s*|-\s*|\*\s*|•\s*)(.+)/g;
    let match;
    while ((match = listPattern.exec(description)) !== null) {
        const item = match[1].trim();
        if (item.length > 3 && item.length < 200) items.push(item);
    }
    if (items.length >= 2) return items;

    // Strategy 2: Split by sentences and create actionable items
    const sentences = description
        .split(/[.!?\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10 && s.length < 200);

    for (const sentence of sentences) {
        // Skip greetings, fillers
        if (/^(hi|hello|hey|please|thanks|note|fyi)/i.test(sentence)) continue;
        items.push(sentence);
    }

    return items.slice(0, 20); // Cap at 20 items
}

// ─── View Tracking ───────────────────────────────────────────────────────────

export async function logTaskView(taskId: string, userId: string, sessionId?: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `INSERT INTO task_view_logs (task_id, user_id, session_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [taskId, userId, sessionId || null]
    );
    return res.rows[0];
}

export async function updateViewDuration(viewLogId: string, durationSeconds: number) {
    await ensureChecklistTables();
    await db.query(
        `UPDATE task_view_logs SET duration_seconds = $2 WHERE id = $1`,
        [viewLogId, durationSeconds]
    );
}

export async function getTaskViewStats(taskId: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `SELECT
            u.id as user_id, u.name as user_name, u.email as user_email,
            COUNT(*) as view_count,
            SUM(vl.duration_seconds) as total_duration_seconds,
            MAX(vl.viewed_at) as last_viewed_at,
            MIN(vl.viewed_at) as first_viewed_at
         FROM task_view_logs vl
         JOIN users u ON vl.user_id = u.id
         WHERE vl.task_id = $1
         GROUP BY u.id, u.name, u.email
         ORDER BY last_viewed_at DESC`,
        [taskId]
    );
    return res.rows;
}

export async function getUserTaskViewStats(taskId: string, userId: string) {
    await ensureChecklistTables();
    const res = await db.query(
        `SELECT
            COUNT(*) as view_count,
            SUM(duration_seconds) as total_duration_seconds,
            MAX(viewed_at) as last_viewed_at
         FROM task_view_logs
         WHERE task_id = $1 AND user_id = $2`,
        [taskId, userId]
    );
    return res.rows[0];
}
