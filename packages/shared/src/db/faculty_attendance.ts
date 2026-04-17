/**
 * Faculty Attendance & Workload — database functions.
 * Powers the BOA-facing daily attendance form and the ops dashboard.
 */
import { db } from './client';

let tablesEnsured = false;

/** Auto-create instructor tables if they don't exist yet (idempotent). */
export async function ensureInstructorTables() {
    if (tablesEnsured) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS instructor_profiles (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                user_id uuid REFERENCES users(id) ON DELETE SET NULL,
                name text NOT NULL,
                email text,
                phone text,
                designation text,
                department text,
                subjects text[] DEFAULT '{}',
                is_active boolean NOT NULL DEFAULT true,
                created_by uuid REFERENCES users(id),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS instructor_attendance (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                date date NOT NULL,
                status text NOT NULL DEFAULT 'present',
                marked_by uuid NOT NULL REFERENCES users(id),
                marked_at timestamptz NOT NULL DEFAULT now(),
                notes text,
                UNIQUE(instructor_id, date)
            );
            CREATE TABLE IF NOT EXISTS instructor_daily_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                instructor_id uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE CASCADE,
                university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                date date NOT NULL,
                sessions_taken int NOT NULL DEFAULT 0,
                subjects_taught text[] DEFAULT '{}',
                topics_covered text,
                workload_notes text,
                logged_by uuid NOT NULL REFERENCES users(id),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE(instructor_id, date)
            );
        `);
        tablesEnsured = true;
    } catch (e) {
        // Tables might already exist with slightly different schema — that's fine
        tablesEnsured = true;
    }
}

// ─── Instructor Profiles ────────────────────────────────────────────

export async function getInstructorsByUniversity(universityId: string) {
    await ensureInstructorTables();

    // Auto-sync: pull from faculty_profiles (which exists in the DB)
    // into instructor_profiles so existing faculty appear immediately.
    try {
        await db.query(`
            INSERT INTO instructor_profiles (university_id, user_id, name, email, designation, department, is_active)
            SELECT
                fp.university_id,
                fp.user_id,
                COALESCE(u.name, fp.employee_code, 'Unknown'),
                u.email,
                fp.designation,
                fp.department,
                COALESCE(fp.is_active, true)
            FROM faculty_profiles fp
            LEFT JOIN users u ON u.id = fp.user_id
            WHERE fp.university_id = $1
              AND NOT EXISTS (
                  SELECT 1 FROM instructor_profiles ip WHERE ip.user_id = fp.user_id AND fp.user_id IS NOT NULL
              )
            ON CONFLICT DO NOTHING
        `, [universityId]);
    } catch { /* faculty_profiles may not have data for this university */ }

    const res = await db.query(
        `SELECT ip.*, u.name AS university_name
         FROM instructor_profiles ip
         LEFT JOIN universities u ON u.id = ip.university_id
         WHERE ip.university_id = $1
         ORDER BY ip.is_active DESC, ip.name`,
        [universityId]
    );
    return res.rows;
}

export async function getInstructorProfile(id: string) {
    const res = await db.query(
        `SELECT ip.*, u.name AS university_name
         FROM instructor_profiles ip
         LEFT JOIN universities u ON u.id = ip.university_id
         WHERE ip.id = $1`,
        [id]
    );
    return res.rows[0] || null;
}

export async function createInstructorProfile(data: {
    university_id: string;
    name: string;
    email?: string;
    phone?: string;
    designation?: string;
    department?: string;
    subjects?: string[];
    user_id?: string;
    created_by: string;
}) {
    const res = await db.query(
        `INSERT INTO instructor_profiles
            (university_id, name, email, phone, designation, department, subjects, user_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            data.university_id, data.name, data.email || null,
            data.phone || null, data.designation || null, data.department || null,
            data.subjects || [], data.user_id || null, data.created_by
        ]
    );
    return res.rows[0];
}

export async function updateInstructorProfile(id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    designation?: string;
    department?: string;
    subjects?: string[];
    is_active?: boolean;
}) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) {
            fields.push(`${key} = $${idx}`);
            values.push(val);
            idx++;
        }
    }
    if (fields.length === 0) return null;

    fields.push(`updated_at = now()`);
    values.push(id);

    const res = await db.query(
        `UPDATE instructor_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
    return res.rows[0] || null;
}

export async function deactivateInstructor(id: string) {
    const res = await db.query(
        `UPDATE instructor_profiles SET is_active = false, updated_at = now() WHERE id = $1 RETURNING *`,
        [id]
    );
    return res.rows[0] || null;
}

// ─── Daily Attendance ───────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'training' | 'wfh' | 'leave' | 'half_day';

export async function getAttendanceForDate(universityId: string, date: string) {
    // Returns all instructors for the university with their attendance for the given date.
    // Instructors without an attendance record for that date show up with status = null.
    const res = await db.query(
        `SELECT ip.id AS instructor_id, ip.name, ip.designation, ip.department,
                ip.subjects, ip.is_active,
                ia.status, ia.notes, ia.marked_by, ia.marked_at
         FROM instructor_profiles ip
         LEFT JOIN instructor_attendance ia ON ia.instructor_id = ip.id AND ia.date = $2
         WHERE ip.university_id = $1 AND ip.is_active = true
         ORDER BY ip.name`,
        [universityId, date]
    );
    return res.rows;
}

export async function markAttendance(data: {
    instructor_id: string;
    university_id: string;
    date: string;
    status: AttendanceStatus;
    notes?: string;
    marked_by: string;
}) {
    const res = await db.query(
        `INSERT INTO instructor_attendance (instructor_id, university_id, date, status, notes, marked_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (instructor_id, date) DO UPDATE SET
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            marked_by = EXCLUDED.marked_by,
            marked_at = now()
         RETURNING *`,
        [data.instructor_id, data.university_id, data.date, data.status, data.notes || null, data.marked_by]
    );
    return res.rows[0];
}

export async function markBulkAttendance(entries: Array<{
    instructor_id: string;
    university_id: string;
    date: string;
    status: AttendanceStatus;
    notes?: string;
    marked_by: string;
}>) {
    if (entries.length === 0) return [];
    const results = [];
    for (const e of entries) {
        results.push(await markAttendance(e));
    }
    return results;
}

// ─── Daily Workload Log ─────────────────────────────────────────────

export async function getWorkloadForDate(universityId: string, date: string) {
    const res = await db.query(
        `SELECT idl.*, ip.name AS instructor_name, ip.designation, ip.subjects AS default_subjects
         FROM instructor_daily_log idl
         JOIN instructor_profiles ip ON ip.id = idl.instructor_id
         WHERE idl.university_id = $1 AND idl.date = $2
         ORDER BY ip.name`,
        [universityId, date]
    );
    return res.rows;
}

export async function upsertWorkloadLog(data: {
    instructor_id: string;
    university_id: string;
    date: string;
    sessions_taken: number;
    subjects_taught?: string[];
    topics_covered?: string;
    workload_notes?: string;
    logged_by: string;
}) {
    const res = await db.query(
        `INSERT INTO instructor_daily_log
            (instructor_id, university_id, date, sessions_taken, subjects_taught, topics_covered, workload_notes, logged_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (instructor_id, date) DO UPDATE SET
            sessions_taken = EXCLUDED.sessions_taken,
            subjects_taught = EXCLUDED.subjects_taught,
            topics_covered = EXCLUDED.topics_covered,
            workload_notes = EXCLUDED.workload_notes,
            logged_by = EXCLUDED.logged_by,
            updated_at = now()
         RETURNING *`,
        [
            data.instructor_id, data.university_id, data.date,
            data.sessions_taken || 0, data.subjects_taught || [],
            data.topics_covered || null, data.workload_notes || null, data.logged_by
        ]
    );
    return res.rows[0];
}

// ─── Cross-university summary (for ops dashboard + reports) ─────────

export async function getAllFacultyAttendanceForReport(startDate: string, endDate: string) {
    // Returns per-university totals + per-instructor detail for the ops report.
    try {
        const summaryRes = await db.query(
            `SELECT
                COALESCE(u.short_name, u.name, 'Unknown') AS university_name,
                ip.university_id,
                COUNT(DISTINCT ip.id) FILTER (WHERE ip.is_active) AS total_faculty,
                COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'present') AS present,
                COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'absent') AS absent,
                COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'training') AS training,
                COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status IN ('leave', 'wfh')) AS on_leave_or_wfh,
                COALESCE(SUM(idl.sessions_taken), 0) AS total_sessions_logged
             FROM instructor_profiles ip
             LEFT JOIN universities u ON u.id = ip.university_id
             LEFT JOIN instructor_attendance ia ON ia.instructor_id = ip.id
                AND ia.date >= $1 AND ia.date <= $2
             LEFT JOIN instructor_daily_log idl ON idl.instructor_id = ip.id
                AND idl.date >= $1 AND idl.date <= $2
             WHERE ip.is_active = true
             GROUP BY u.short_name, u.name, ip.university_id
             ORDER BY COALESCE(u.short_name, u.name)`,
            [startDate, endDate]
        );

        // Show ALL active instructors — those with attendance marked show their
        // status; those without show 'not_marked' so the report makes it obvious
        // who hasn't been tracked yet.
        const detailRes = await db.query(
            `SELECT
                ip.name, ip.designation, ip.subjects,
                COALESCE(u.short_name, u.name, 'Unknown') AS university_name,
                COALESCE(ia.date, $1::date) AS date,
                COALESCE(ia.status, 'not_marked') AS status,
                ia.notes,
                idl.sessions_taken, idl.subjects_taught, idl.topics_covered
             FROM instructor_profiles ip
             LEFT JOIN universities u ON u.id = ip.university_id
             LEFT JOIN instructor_attendance ia ON ia.instructor_id = ip.id
                AND ia.date >= $1 AND ia.date <= $2
             LEFT JOIN instructor_daily_log idl ON idl.instructor_id = ip.id
                AND idl.date = COALESCE(ia.date, $1::date)
             WHERE ip.is_active = true
             ORDER BY COALESCE(u.short_name, u.name), ip.name, ia.date`,
            [startDate, endDate]
        );

        return {
            byUniversity: summaryRes.rows,
            detail: detailRes.rows
        };
    } catch {
        return { byUniversity: [], detail: [] };
    }
}

// ─── Summary / Stats (for ops dashboard) ────────────────────────────

export async function getAttendanceSummary(universityId: string, startDate: string, endDate: string) {
    const res = await db.query(
        `SELECT
            COUNT(DISTINCT ip.id) FILTER (WHERE ip.is_active) AS total_instructors,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'present') AS present,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'absent') AS absent,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'training') AS training,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'wfh') AS wfh,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'leave') AS on_leave,
            COUNT(DISTINCT ia.instructor_id) FILTER (WHERE ia.status = 'half_day') AS half_day,
            COUNT(DISTINCT idl.instructor_id) AS instructors_with_logs,
            COALESCE(SUM(idl.sessions_taken), 0) AS total_sessions_logged
         FROM instructor_profiles ip
         LEFT JOIN instructor_attendance ia ON ia.instructor_id = ip.id
            AND ia.date >= $2 AND ia.date <= $3
         LEFT JOIN instructor_daily_log idl ON idl.instructor_id = ip.id
            AND idl.date >= $2 AND idl.date <= $3
         WHERE ip.university_id = $1 AND ip.is_active = true`,
        [universityId, startDate, endDate]
    );
    return res.rows[0];
}

export async function getAttendanceByDate(universityId: string, startDate: string, endDate: string) {
    const res = await db.query(
        `SELECT
            ia.date,
            COUNT(*) FILTER (WHERE ia.status = 'present') AS present,
            COUNT(*) FILTER (WHERE ia.status = 'absent') AS absent,
            COUNT(*) FILTER (WHERE ia.status = 'training') AS training,
            COUNT(*) FILTER (WHERE ia.status = 'wfh') AS wfh,
            COUNT(*) FILTER (WHERE ia.status = 'leave') AS on_leave,
            COUNT(*) AS total_marked
         FROM instructor_attendance ia
         WHERE ia.university_id = $1 AND ia.date >= $2 AND ia.date <= $3
         GROUP BY ia.date
         ORDER BY ia.date`,
        [universityId, startDate, endDate]
    );
    return res.rows;
}

export async function getMonthlyInstructorReport(universityId: string, year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const res = await db.query(
        `SELECT
            ip.id, ip.name, ip.designation, ip.department, ip.subjects,
            COUNT(*) FILTER (WHERE ia.status = 'present') AS days_present,
            COUNT(*) FILTER (WHERE ia.status = 'absent') AS days_absent,
            COUNT(*) FILTER (WHERE ia.status = 'training') AS days_training,
            COUNT(*) FILTER (WHERE ia.status = 'wfh') AS days_wfh,
            COUNT(*) FILTER (WHERE ia.status = 'leave') AS days_leave,
            COUNT(*) FILTER (WHERE ia.status IS NOT NULL) AS total_marked,
            COALESCE(SUM(idl.sessions_taken), 0) AS total_sessions,
            ARRAY_AGG(DISTINCT unnest_subject) FILTER (WHERE unnest_subject IS NOT NULL) AS all_subjects_taught,
            STRING_AGG(DISTINCT idl.topics_covered, '; ') FILTER (WHERE idl.topics_covered IS NOT NULL) AS all_topics
         FROM instructor_profiles ip
         LEFT JOIN instructor_attendance ia ON ia.instructor_id = ip.id
            AND ia.date >= $2 AND ia.date <= $3
         LEFT JOIN instructor_daily_log idl ON idl.instructor_id = ip.id
            AND idl.date >= $2 AND idl.date <= $3
         LEFT JOIN LATERAL unnest(idl.subjects_taught) AS unnest_subject ON true
         WHERE ip.university_id = $1 AND ip.is_active = true
         GROUP BY ip.id, ip.name, ip.designation, ip.department, ip.subjects
         ORDER BY ip.name`,
        [universityId, startDate, endDate]
    );
    return res.rows;
}
