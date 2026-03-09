import { db } from '../db/client';

export interface TimetableVersion {
    id: string;
    university_id: string;
    program_id: string;
    term_id: string;
    section_id: string;
    version_number: number;
    version_status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    effective_from?: Date;
    published_at?: Date;
    published_by?: string;
    notes?: string;
}

export interface TimetableSession {
    id: string;
    timetable_version_id: string;
    subject_id: string;
    faculty_profile_id: string;
    classroom_id: string;
    session_date: Date;
    slot_start: string;
    slot_end: string;
    delivery_mode: string;
    session_status: string;
}

export class SchedulingService {
    // --- Timetable Versioning ---

    static async createTimetableVersion(data: Omit<TimetableVersion, 'id' | 'version_number' | 'version_status'>) {
        // Get latest version number
        const versionResult = await db.query(
            `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
             FROM timetable_versions 
             WHERE section_id = $1`,
            [data.section_id]
        );
        const nextVersion = versionResult.rows[0].next_version;

        const result = await db.query(
            `INSERT INTO timetable_versions (university_id, program_id, term_id, section_id, version_number, version_status, notes)
             VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
             RETURNING *`,
            [data.university_id, data.program_id, data.term_id, data.section_id, nextVersion, data.notes]
        );
        return result.rows[0] as TimetableVersion;
    }

    static async publishVersion(versionId: string, publishedBy: string, effectiveFrom: Date) {
        await db.query('BEGIN');
        try {
            // Archive old published version for this section
            const version = await db.query('SELECT section_id FROM timetable_versions WHERE id = $1', [versionId]);
            const sectionId = version.rows[0].section_id;

            await db.query(
                `UPDATE timetable_versions 
                 SET version_status = 'ARCHIVED' 
                 WHERE section_id = $1 AND version_status = 'PUBLISHED'`,
                [sectionId]
            );

            // Publish new version
            const result = await db.query(
                `UPDATE timetable_versions 
                 SET version_status = 'PUBLISHED', published_at = NOW(), published_by = $2, effective_from = $3
                 WHERE id = $1
                 RETURNING *`,
                [versionId, publishedBy, effectiveFrom]
            );

            await db.query('COMMIT');
            return result.rows[0] as TimetableVersion;
        } catch (e) {
            await db.query('ROLLBACK');
            throw e;
        }
    }

    // --- Session Management ---

    static async addSession(data: Omit<TimetableSession, 'id' | 'session_status'>) {
        // Get metadata from version
        const version = await db.query(
            'SELECT university_id, program_id, term_id, section_id FROM timetable_versions WHERE id = $1',
            [data.timetable_version_id]
        );
        const { university_id, program_id, term_id, section_id } = version.rows[0];

        const result = await db.query(
            `INSERT INTO timetable_sessions (
                timetable_version_id, university_id, program_id, term_id, section_id, 
                subject_id, faculty_profile_id, classroom_id, session_date, slot_start, slot_end, delivery_mode
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                data.timetable_version_id, university_id, program_id, term_id, section_id,
                data.subject_id, data.faculty_profile_id, data.classroom_id, data.session_date, data.slot_start, data.slot_end, data.delivery_mode
            ]
        );
        return result.rows[0] as TimetableSession;
    }

    static async getSectionSchedule(sectionId: string, startDate: Date, endDate: Date) {
        const result = await db.query(
            `SELECT s.*, sub.name as subject_name, sub.code as subject_code, f.employee_code, u.name as faculty_name, c.name as classroom_name
             FROM timetable_sessions s
             JOIN subjects sub ON s.subject_id = sub.id
             JOIN faculty_profiles f ON s.faculty_profile_id = f.id
             JOIN users u ON f.user_id = u.id
             JOIN classrooms c ON s.classroom_id = c.id
             JOIN timetable_versions v ON s.timetable_version_id = v.id
             WHERE s.section_id = $1 
             AND v.version_status = 'PUBLISHED'
             AND s.session_date BETWEEN $2 AND $3
             ORDER BY s.session_date, s.slot_start`,
            [sectionId, startDate, endDate]
        );
        return result.rows;
    }

    // --- Execution & Change Logging ---

    static async markSessionExecution(sessionId: string, data: { status: string; facultyId?: string; roomId?: string; notes?: string; markedBy: string }) {
        await db.query('BEGIN');
        try {
            // Update session status
            await db.query(
                'UPDATE timetable_sessions SET session_status = $1, updated_at = NOW() WHERE id = $2',
                [data.status, sessionId]
            );

            // Log execution
            const result = await db.query(
                `INSERT INTO session_execution_logs (
                    timetable_session_id, actual_faculty_profile_id, actual_classroom_id, 
                    execution_status, completion_notes, marked_by
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [sessionId, data.facultyId || null, data.roomId || null, data.status, data.notes, data.markedBy]
            );

            await db.query('COMMIT');
            return result.rows[0];
        } catch (e) {
            await db.query('ROLLBACK');
            throw e;
        }
    }

    // --- Conflict Detection (DB Level Check) ---

    static async checkConflicts(sessionId: string) {
        const session = await db.query('SELECT * FROM timetable_sessions WHERE id = $1', [sessionId]);
        const s = session.rows[0];

        // Check for Faculty Clash
        const facultyClash = await db.query(
            `SELECT id FROM timetable_sessions 
             WHERE faculty_profile_id = $1 AND session_date = $2 AND id != $3
             AND (($4 >= slot_start AND $4 < slot_end) OR ($5 > slot_start AND $5 <= slot_end))`,
            [s.faculty_profile_id, s.session_date, s.id, s.slot_start, s.slot_end]
        );

        // Check for Room Clash
        const roomClash = await db.query(
            `SELECT id FROM timetable_sessions 
             WHERE classroom_id = $1 AND session_date = $2 AND id != $3
             AND (($4 >= slot_start AND $4 < slot_end) OR ($5 > slot_start AND $5 <= slot_end))`,
            [s.classroom_id, s.session_date, s.id, s.slot_start, s.slot_end]
        );

        const conflicts = [];
        if (facultyClash.rows.length > 0) conflicts.push({ type: 'FACULTY_CLASH', id: facultyClash.rows[0].id });
        if (roomClash.rows.length > 0) conflicts.push({ type: 'ROOM_CLASH', id: roomClash.rows[0].id });

        return conflicts;
    }
}
