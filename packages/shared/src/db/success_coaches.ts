/**
 * Success Coach Performance — database functions.
 * Tracks daily calls made vs targets per coach per university.
 */
import { db } from './client';

let tablesEnsured = false;

export async function ensureCoachTables() {
    if (tablesEnsured) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS success_coach_profiles (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                user_id uuid REFERENCES users(id) ON DELETE SET NULL,
                name text NOT NULL, email text, phone text,
                daily_call_target int NOT NULL DEFAULT 15,
                is_active boolean NOT NULL DEFAULT true,
                created_by uuid REFERENCES users(id),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS success_coach_daily_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                coach_id uuid NOT NULL REFERENCES success_coach_profiles(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                date date NOT NULL,
                student_calls_made int NOT NULL DEFAULT 0,
                parent_calls_made int NOT NULL DEFAULT 0,
                daily_target int NOT NULL DEFAULT 15,
                notes text,
                logged_by uuid NOT NULL REFERENCES users(id),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE(coach_id, date)
            );
        `);
        tablesEnsured = true;
    } catch { tablesEnsured = true; }
}

// ─── Coach Profiles ─────────────────────────────────────────────────

export async function getCoachesByUniversity(universityId: string) {
    await ensureCoachTables();
    // Auto-sync: pull users with COS role into coach profiles
    try {
        await db.query(`
            INSERT INTO success_coach_profiles (university_id, user_id, name, email, is_active)
            SELECT u.university_id, u.id, u.name, u.email, u.is_active
            FROM users u
            WHERE u.university_id = $1 AND u.is_active = true
              AND u.role = 'COS'
              AND NOT EXISTS (SELECT 1 FROM success_coach_profiles sc WHERE sc.user_id = u.id)
            ON CONFLICT DO NOTHING
        `, [universityId]);
    } catch {}
    const res = await db.query(
        `SELECT sc.*, u.name AS university_name
         FROM success_coach_profiles sc
         LEFT JOIN universities u ON u.id = sc.university_id
         WHERE sc.university_id = $1
         ORDER BY sc.is_active DESC, sc.name`,
        [universityId]
    );
    return res.rows;
}

export async function createCoachProfile(data: {
    university_id: string; name: string; email?: string; phone?: string;
    daily_call_target?: number; user_id?: string; created_by: string;
}) {
    const res = await db.query(
        `INSERT INTO success_coach_profiles (university_id, name, email, phone, daily_call_target, user_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        // Use ?? not || on the target: a coach with daily_call_target=0
        // (e.g. invigilation-only days at creation) must stick at 0.
        [data.university_id, data.name, data.email || null, data.phone || null,
         data.daily_call_target ?? 15, data.user_id || null, data.created_by]
    );
    return res.rows[0];
}

export async function updateCoachProfile(id: string, data: {
    name?: string; email?: string; phone?: string; daily_call_target?: number; is_active?: boolean;
}) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) { fields.push(`${key} = $${idx}`); values.push(val); idx++; }
    }
    if (fields.length === 0) return null;
    fields.push('updated_at = now()');
    values.push(id);
    const res = await db.query(
        `UPDATE success_coach_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    return res.rows[0] || null;
}

export async function deactivateCoach(id: string) {
    const res = await db.query(
        `UPDATE success_coach_profiles SET is_active = false, updated_at = now() WHERE id = $1 RETURNING *`, [id]
    );
    return res.rows[0] || null;
}

// ─── Daily Call Logging ─────────────────────────────────────────────

export async function getCoachLogsForDate(universityId: string, date: string) {
    await ensureCoachTables();
    const res = await db.query(
        `SELECT sc.id AS coach_id, sc.name, sc.email, sc.daily_call_target, sc.is_active,
                cl.student_calls_made, cl.parent_calls_made, cl.daily_target,
                cl.notes, cl.logged_by, cl.created_at AS logged_at
         FROM success_coach_profiles sc
         LEFT JOIN success_coach_daily_log cl ON cl.coach_id = sc.id AND cl.date = $2
         WHERE sc.university_id = $1 AND sc.is_active = true
         ORDER BY sc.name`,
        [universityId, date]
    );
    return res.rows;
}

export async function upsertCoachDailyLog(data: {
    coach_id: string; university_id: string; date: string;
    student_calls_made: number; parent_calls_made: number;
    daily_target: number; notes?: string; logged_by: string;
}) {
    const res = await db.query(
        `INSERT INTO success_coach_daily_log
            (coach_id, university_id, date, student_calls_made, parent_calls_made, daily_target, notes, logged_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (coach_id, date) DO UPDATE SET
            student_calls_made = EXCLUDED.student_calls_made,
            parent_calls_made = EXCLUDED.parent_calls_made,
            daily_target = EXCLUDED.daily_target,
            notes = EXCLUDED.notes,
            logged_by = EXCLUDED.logged_by,
            updated_at = now()
         RETURNING *`,
        // Use ?? for count + target fields so a legitimate 0 (e.g. coach
        // out on invigilation, target=0/calls=0 for that day) is preserved
        // instead of being silently substituted with 15.
        [data.coach_id, data.university_id, data.date,
         data.student_calls_made ?? 0, data.parent_calls_made ?? 0,
         data.daily_target ?? 15, data.notes ?? null, data.logged_by]
    );
    return res.rows[0];
}

// ─── Cross-university summary (for ops reports) ─────────────────────

export async function getAllCoachDataForReport(startDate: string, endDate: string) {
    try {
        await ensureCoachTables();
        const summaryRes = await db.query(
            `SELECT
                COALESCE(u.short_name, u.name) AS university_name,
                sc.university_id,
                COUNT(DISTINCT sc.id) FILTER (WHERE sc.is_active) AS total_coaches,
                COALESCE(SUM(cl.student_calls_made), 0) AS total_student_calls,
                COALESCE(SUM(cl.parent_calls_made), 0) AS total_parent_calls,
                COALESCE(SUM(cl.daily_target), 0) AS total_target,
                COUNT(DISTINCT cl.coach_id) AS coaches_logged
             FROM success_coach_profiles sc
             LEFT JOIN universities u ON u.id = sc.university_id
             LEFT JOIN success_coach_daily_log cl ON cl.coach_id = sc.id
                AND cl.date >= $1 AND cl.date <= $2
             WHERE sc.is_active = true
             GROUP BY u.short_name, u.name, sc.university_id
             ORDER BY u.short_name`,
            [startDate, endDate]
        );
        const detailRes = await db.query(
            `SELECT sc.name, COALESCE(u.short_name, u.name) AS university_name,
                    cl.date, cl.student_calls_made, cl.parent_calls_made,
                    cl.daily_target, cl.notes
             FROM success_coach_profiles sc
             LEFT JOIN universities u ON u.id = sc.university_id
             LEFT JOIN success_coach_daily_log cl ON cl.coach_id = sc.id
                AND cl.date >= $1 AND cl.date <= $2
             WHERE sc.is_active = true AND cl.student_calls_made IS NOT NULL
             ORDER BY u.short_name, sc.name, cl.date`,
            [startDate, endDate]
        );
        return { byUniversity: summaryRes.rows, detail: detailRes.rows };
    } catch {
        return { byUniversity: [], detail: [] };
    }
}

// ─── Monthly per-coach report ───────────────────────────────────────

export async function getMonthlyCoachReport(universityId: string, year: number, month: number) {
    await ensureCoachTables();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const res = await db.query(
        `SELECT sc.id, sc.name, sc.email, sc.daily_call_target,
                COUNT(cl.id)::int AS days_logged,
                COALESCE(SUM(cl.student_calls_made), 0)::int AS total_student_calls,
                COALESCE(SUM(cl.parent_calls_made), 0)::int AS total_parent_calls,
                COALESCE(SUM(cl.daily_target), 0)::int AS total_target,
                COALESCE(SUM(cl.student_calls_made + cl.parent_calls_made), 0)::int AS total_calls
         FROM success_coach_profiles sc
         LEFT JOIN success_coach_daily_log cl ON cl.coach_id = sc.id
            AND cl.date >= $2 AND cl.date <= $3
         WHERE sc.university_id = $1 AND sc.is_active = true
         GROUP BY sc.id, sc.name, sc.email, sc.daily_call_target
         ORDER BY total_calls DESC`,
        [universityId, startDate, endDate]
    );
    return res.rows;
}
