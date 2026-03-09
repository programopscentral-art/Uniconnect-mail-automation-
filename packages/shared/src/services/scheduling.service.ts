import { db } from '../db/client';

export interface TimetableSessionInput {
    university_id: string;
    term_id: string;
    section_id: string;
    subject_id: string;
    faculty_profile_id: string;
    classroom_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
}

export interface ConflictRecord {
    conflict_type: 'FACULTY_CLASH' | 'ROOM_CLASH' | 'SECTION_CLASH' | 'SUBJECT_MISMATCH' | 'SLOT_VIOLATION';
    severity: 'CRITICAL' | 'ERROR' | 'WARNING';
    description: string;
    affected_entities: any;
}

export class SchedulingService {
    /**
     * Validates a draft session against all existing sessions and rules.
     * Returns an array of detected conflicts.
     */
    static async detectConflicts(session: TimetableSessionInput, currentVersionId?: string): Promise<ConflictRecord[]> {
        const conflicts: ConflictRecord[] = [];

        // 1. Check Faculty Clash (Same faculty, same time)
        const facultyClash = await db.query(
            `SELECT * FROM timetable_sessions 
             WHERE university_id = $1 AND faculty_profile_id = $2 AND day_of_week = $3
             AND (start_time, end_time) OVERLAPS ($4::TIME, $5::TIME)
             AND status = 'ACTIVE'`,
            [session.university_id, session.faculty_profile_id, session.day_of_week, session.start_time, session.end_time]
        );
        if (facultyClash.rows.length > 0) {
            conflicts.push({
                conflict_type: 'FACULTY_CLASH',
                severity: 'CRITICAL',
                description: `Faculty is already assigned to another session during this time.`,
                affected_entities: { sessions: facultyClash.rows }
            });
        }

        // 2. Check Room Clash (Same room, same time)
        const roomClash = await db.query(
            `SELECT * FROM timetable_sessions 
             WHERE university_id = $1 AND classroom_id = $2 AND day_of_week = $3
             AND (start_time, end_time) OVERLAPS ($4::TIME, $5::TIME)
             AND status = 'ACTIVE'`,
            [session.university_id, session.classroom_id, session.day_of_week, session.start_time, session.end_time]
        );
        if (roomClash.rows.length > 0) {
            conflicts.push({
                conflict_type: 'ROOM_CLASH',
                severity: 'CRITICAL',
                description: `Room is already occupied by another session during this time.`,
                affected_entities: { sessions: roomClash.rows }
            });
        }

        // 3. Check Section Clash (Same section, same time)
        const sectionClash = await db.query(
            `SELECT * FROM timetable_sessions 
             WHERE university_id = $1 AND section_id = $2 AND day_of_week = $3
             AND (start_time, end_time) OVERLAPS ($4::TIME, $5::TIME)
             AND status = 'ACTIVE'`,
            [session.university_id, session.section_id, session.day_of_week, session.start_time, session.end_time]
        );
        if (sectionClash.rows.length > 0) {
            conflicts.push({
                conflict_type: 'SECTION_CLASH',
                severity: 'CRITICAL',
                description: `Section/Batch already has another session at this time.`,
                affected_entities: { sessions: sectionClash.rows }
            });
        }

        // 4. Check Subject Mismatch (Faculty assigned to unknown subject)
        const mappingRes = await db.query(
            `SELECT * FROM faculty_subject_mappings 
             WHERE faculty_profile_id = $1 AND subject_id = $2`,
            [session.faculty_profile_id, session.subject_id]
        );
        if (mappingRes.rows.length === 0) {
            conflicts.push({
                conflict_type: 'SUBJECT_MISMATCH',
                severity: 'WARNING',
                description: `Faculty is not officially mapped to this subject.`,
                affected_entities: { faculty_profile_id: session.faculty_profile_id, subject_id: session.subject_id }
            });
        }

        // 5. Check Slot Violation (Outside university defined slots)
        const slotMatch = await db.query(
            `SELECT * FROM university_slots 
             WHERE university_id = $1 AND start_time <= $2 AND end_time >= $3 AND is_active = true`,
            [session.university_id, session.start_time, session.end_time]
        );
        if (slotMatch.rows.length === 0) {
            conflicts.push({
                conflict_type: 'SLOT_VIOLATION',
                severity: 'ERROR',
                description: `Session timing does not align with any defined university slot.`,
                affected_entities: { start_time: session.start_time, end_time: session.end_time }
            });
        }

        return conflicts;
    }

    /**
     * Creates a new session in a draft version.
     */
    static async createSession(data: TimetableSessionInput & { timetable_version_id: string }) {
        const res = await db.query(
            `INSERT INTO timetable_sessions (
                timetable_version_id, university_id, term_id, section_id, subject_id, 
                faculty_profile_id, classroom_id, day_of_week, start_time, end_time, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT')
            RETURNING *`,
            [
                data.timetable_version_id, data.university_id, data.term_id, data.section_id,
                data.subject_id, data.faculty_profile_id, data.classroom_id, data.day_of_week,
                data.start_time, data.end_time
            ]
        );
        return res.rows[0];
    }

    /**
     * Gets all conflicts for a specific university or version.
     * Used by the Conflict Center.
     */
    static async getAllConflicts(universityId: string, timetableVersionId?: string) {
        let query = `SELECT * FROM scheduling_conflicts WHERE university_id = $1 AND resolution_status = 'OPEN'`;
        const params: any[] = [universityId];

        if (timetableVersionId) {
            query += ` AND timetable_version_id = $2`;
            params.push(timetableVersionId);
        }

        const res = await db.query(query, params);
        return res.rows;
    }

    /**
     * Publishes a draft timetable version, promoting sessions to the active log.
     */
    static async publishTimetable(universityId: string, timetableVersionId: string, actorId: string) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const versionRes = await client.query('SELECT * FROM timetable_versions WHERE id = $1', [timetableVersionId]);
            if (versionRes.rows.length === 0) throw new Error("Version not found.");

            // 1. Archive current active sessions for the same term/section
            const { term_id, section_id } = versionRes.rows[0];
            await client.query(
                `UPDATE timetable_sessions SET status = 'ARCHIVED' 
                 WHERE university_id = $1 AND term_id = $2 AND section_id = $3 AND status = 'ACTIVE'`,
                [universityId, term_id, section_id]
            );

            // 2. Promote Draft to Active
            await client.query(
                `UPDATE timetable_sessions SET status = 'ACTIVE' 
                 WHERE timetable_version_id = $1`,
                [timetableVersionId]
            );

            // 3. Mark version as published
            await client.query(
                `UPDATE timetable_versions SET version_status = 'PUBLISHED', published_at = NOW(), published_by = $2
                 WHERE id = $1`,
                [timetableVersionId, actorId]
            );

            await client.query('COMMIT');
            return true;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}
