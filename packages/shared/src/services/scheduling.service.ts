import { db } from '../db/client';

export interface TimetableSessionInput {
    university_id: string;
    program_id: string;
    term_id: string;
    section_id: string;
    subject_id: string;
    faculty_profile_id: string | null;
    classroom_id: string | null;
    session_date: string; // YYYY-MM-DD
    slot_start: string;   // HH:MM
    slot_end: string;     // HH:MM
    delivery_mode?: string;
    planned_topic?: string;
    planned_sequence_no?: number;
}

export interface ConflictRecord {
    conflict_type: 'FACULTY_CLASH' | 'ROOM_CLASH' | 'SECTION_CLASH' | 'SUBJECT_MISMATCH' | 'SLOT_VIOLATION';
    severity: 'CRITICAL' | 'ERROR' | 'WARNING';
    description: string;
    affected_entities: any;
}

// Auto-create tables if they don't exist
let _migrated = false;
async function ensureTables() {
    if (_migrated) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
                term_id UUID REFERENCES terms(id) ON DELETE CASCADE,
                section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL DEFAULT 1,
                version_status TEXT DEFAULT 'DRAFT',
                effective_from DATE,
                published_at TIMESTAMPTZ,
                published_by UUID REFERENCES users(id),
                notes TEXT,
                source_type TEXT DEFAULT 'UPLOAD',
                source_metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timetable_version_id UUID NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
                university_id UUID NOT NULL REFERENCES universities(id),
                program_id UUID REFERENCES programs(id),
                term_id UUID REFERENCES terms(id),
                section_id UUID REFERENCES sections(id),
                subject_id UUID REFERENCES subjects(id),
                faculty_profile_id UUID REFERENCES faculty_profiles(id),
                classroom_id UUID REFERENCES classrooms(id),
                session_date DATE NOT NULL,
                slot_start TIME NOT NULL,
                slot_end TIME NOT NULL,
                delivery_mode TEXT DEFAULT 'PHYSICAL',
                planned_topic TEXT,
                planned_sequence_no INTEGER,
                session_status TEXT DEFAULT 'SCHEDULED',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_sessions_section_date ON timetable_sessions(section_id, session_date)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_sessions_faculty_date ON timetable_sessions(faculty_profile_id, session_date)`);
        await db.query(`
            CREATE TABLE IF NOT EXISTS university_slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                slot_type TEXT DEFAULT 'LECTURE',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(university_id, start_time, end_time)
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS scheduling_conflicts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timetable_session_id UUID REFERENCES timetable_sessions(id) ON DELETE CASCADE,
                university_id UUID REFERENCES universities(id),
                conflict_type TEXT NOT NULL,
                conflict_severity TEXT DEFAULT 'HIGH',
                related_entity_type TEXT,
                related_entity_id UUID,
                description TEXT,
                resolution_status TEXT DEFAULT 'OPEN',
                resolved_by UUID REFERENCES users(id),
                resolved_at TIMESTAMPTZ,
                resolution_note TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS session_execution_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timetable_session_id UUID NOT NULL REFERENCES timetable_sessions(id) ON DELETE CASCADE,
                actual_faculty_profile_id UUID REFERENCES faculty_profiles(id),
                actual_classroom_id UUID REFERENCES classrooms(id),
                actual_start_time TIMESTAMPTZ,
                actual_end_time TIMESTAMPTZ,
                execution_status TEXT DEFAULT 'COMPLETED',
                completion_notes TEXT,
                marked_by UUID REFERENCES users(id),
                marked_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        _migrated = true;
    } catch { _migrated = true; }
}

export class SchedulingService {
    /**
     * Detect conflicts for a session against existing sessions on the same date.
     */
    static async detectConflicts(session: TimetableSessionInput, excludeSessionId?: string): Promise<ConflictRecord[]> {
        await ensureTables();
        const conflicts: ConflictRecord[] = [];
        const excludeClause = excludeSessionId ? `AND ts.id != '${excludeSessionId}'` : '';

        // 1. Faculty Clash
        if (session.faculty_profile_id) {
            const facultyClash = await db.query(
                `SELECT ts.*, s.name as subject_name, sec.name as section_name
                 FROM timetable_sessions ts
                 LEFT JOIN subjects s ON ts.subject_id = s.id
                 LEFT JOIN sections sec ON ts.section_id = sec.id
                 WHERE ts.university_id = $1 AND ts.faculty_profile_id = $2 AND ts.session_date = $3
                 AND (ts.slot_start, ts.slot_end) OVERLAPS ($4::TIME, $5::TIME)
                 AND ts.session_status NOT IN ('CANCELLED') ${excludeClause}`,
                [session.university_id, session.faculty_profile_id, session.session_date, session.slot_start, session.slot_end]
            );
            if (facultyClash.rows.length > 0) {
                conflicts.push({
                    conflict_type: 'FACULTY_CLASH',
                    severity: 'CRITICAL',
                    description: `Faculty already assigned to ${facultyClash.rows[0].subject_name || 'another session'} (${facultyClash.rows[0].section_name || 'unknown section'}) at this time.`,
                    affected_entities: { sessions: facultyClash.rows }
                });
            }
        }

        // 2. Room Clash
        if (session.classroom_id) {
            const roomClash = await db.query(
                `SELECT ts.*, s.name as subject_name, sec.name as section_name
                 FROM timetable_sessions ts
                 LEFT JOIN subjects s ON ts.subject_id = s.id
                 LEFT JOIN sections sec ON ts.section_id = sec.id
                 WHERE ts.university_id = $1 AND ts.classroom_id = $2 AND ts.session_date = $3
                 AND (ts.slot_start, ts.slot_end) OVERLAPS ($4::TIME, $5::TIME)
                 AND ts.session_status NOT IN ('CANCELLED') ${excludeClause}`,
                [session.university_id, session.classroom_id, session.session_date, session.slot_start, session.slot_end]
            );
            if (roomClash.rows.length > 0) {
                conflicts.push({
                    conflict_type: 'ROOM_CLASH',
                    severity: 'CRITICAL',
                    description: `Room already occupied by ${roomClash.rows[0].subject_name || 'another session'} for ${roomClash.rows[0].section_name || 'unknown section'}.`,
                    affected_entities: { sessions: roomClash.rows }
                });
            }
        }

        // 3. Section Clash
        if (session.section_id) {
            const sectionClash = await db.query(
                `SELECT ts.*, s.name as subject_name
                 FROM timetable_sessions ts
                 LEFT JOIN subjects s ON ts.subject_id = s.id
                 WHERE ts.university_id = $1 AND ts.section_id = $2 AND ts.session_date = $3
                 AND (ts.slot_start, ts.slot_end) OVERLAPS ($4::TIME, $5::TIME)
                 AND ts.session_status NOT IN ('CANCELLED') ${excludeClause}`,
                [session.university_id, session.section_id, session.session_date, session.slot_start, session.slot_end]
            );
            if (sectionClash.rows.length > 0) {
                conflicts.push({
                    conflict_type: 'SECTION_CLASH',
                    severity: 'CRITICAL',
                    description: `Section already has ${sectionClash.rows[0].subject_name || 'another session'} at this time.`,
                    affected_entities: { sessions: sectionClash.rows }
                });
            }
        }

        // 4. Slot Violation
        const slotMatch = await db.query(
            `SELECT * FROM university_slots
             WHERE university_id = $1 AND start_time = $2::TIME AND end_time = $3::TIME AND is_active = true`,
            [session.university_id, session.slot_start, session.slot_end]
        );
        if (slotMatch.rows.length === 0) {
            conflicts.push({
                conflict_type: 'SLOT_VIOLATION',
                severity: 'WARNING',
                description: `Session timing ${session.slot_start}-${session.slot_end} does not match any defined university slot.`,
                affected_entities: { slot_start: session.slot_start, slot_end: session.slot_end }
            });
        }

        return conflicts;
    }

    /**
     * Create a single session in a timetable version.
     */
    static async createSession(data: TimetableSessionInput & { timetable_version_id: string }) {
        await ensureTables();
        const res = await db.query(
            `INSERT INTO timetable_sessions (
                timetable_version_id, university_id, program_id, term_id, section_id, subject_id,
                faculty_profile_id, classroom_id, session_date, slot_start, slot_end,
                delivery_mode, planned_topic, planned_sequence_no, session_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIME, $11::TIME, $12, $13, $14, 'SCHEDULED')
            RETURNING *`,
            [
                data.timetable_version_id, data.university_id, data.program_id, data.term_id,
                data.section_id, data.subject_id, data.faculty_profile_id, data.classroom_id,
                data.session_date, data.slot_start, data.slot_end,
                data.delivery_mode || 'PHYSICAL', data.planned_topic || null, data.planned_sequence_no || null
            ]
        );
        return res.rows[0];
    }

    /**
     * Add a session (called by the sessions API POST).
     */
    static async addSession(data: {
        timetable_version_id: string;
        subject_id: string;
        faculty_profile_id: string;
        classroom_id: string;
        session_date: Date;
        slot_start: string;
        slot_end: string;
        delivery_mode: string;
        planned_topic?: string;
    }) {
        await ensureTables();
        // Get version info to fill university/program/term/section
        const vRes = await db.query(`SELECT * FROM timetable_versions WHERE id = $1`, [data.timetable_version_id]);
        if (!vRes.rows[0]) throw new Error('Timetable version not found');
        const v = vRes.rows[0];

        const res = await db.query(
            `INSERT INTO timetable_sessions (
                timetable_version_id, university_id, program_id, term_id, section_id,
                subject_id, faculty_profile_id, classroom_id,
                session_date, slot_start, slot_end, delivery_mode, planned_topic, session_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIME, $11::TIME, $12, $13, 'SCHEDULED')
            RETURNING *`,
            [
                data.timetable_version_id, v.university_id, v.program_id, v.term_id, v.section_id,
                data.subject_id, data.faculty_profile_id, data.classroom_id,
                data.session_date.toISOString().split('T')[0], data.slot_start, data.slot_end,
                data.delivery_mode, data.planned_topic || null
            ]
        );
        return res.rows[0];
    }

    /**
     * Bulk create sessions for an import.
     */
    static async bulkCreateSessions(versionId: string, sessions: TimetableSessionInput[]) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const created: any[] = [];
            for (const s of sessions) {
                const res = await client.query(
                    `INSERT INTO timetable_sessions (
                        timetable_version_id, university_id, program_id, term_id, section_id,
                        subject_id, faculty_profile_id, classroom_id,
                        session_date, slot_start, slot_end, delivery_mode, planned_topic,
                        planned_sequence_no, session_status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIME, $11::TIME, $12, $13, $14, 'SCHEDULED')
                    RETURNING *`,
                    [
                        versionId, s.university_id, s.program_id, s.term_id, s.section_id,
                        s.subject_id, s.faculty_profile_id, s.classroom_id,
                        s.session_date, s.slot_start, s.slot_end,
                        s.delivery_mode || 'PHYSICAL', s.planned_topic || null,
                        s.planned_sequence_no || null
                    ]
                );
                created.push(res.rows[0]);
            }
            await client.query('COMMIT');
            return created;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Get section schedule for a date range.
     */
    static async getSectionSchedule(sectionId: string, startDate: Date, endDate: Date) {
        await ensureTables();
        const res = await db.query(
            `SELECT ts.*,
                    s.name as subject_name, s.code as subject_code,
                    sec.name as section_name,
                    cr.name as room_name, cr.building,
                    COALESCE(u.name, fp.employee_code) as faculty_name
             FROM timetable_sessions ts
             LEFT JOIN subjects s ON ts.subject_id = s.id
             LEFT JOIN sections sec ON ts.section_id = sec.id
             LEFT JOIN classrooms cr ON ts.classroom_id = cr.id
             LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
             LEFT JOIN users u ON fp.user_id = u.id
             WHERE ts.section_id = $1
               AND ts.session_date >= $2 AND ts.session_date <= $3
               AND ts.session_status NOT IN ('CANCELLED')
             ORDER BY ts.session_date, ts.slot_start`,
            [sectionId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
        );
        return res.rows;
    }

    /**
     * Get faculty schedule for a date (or date range).
     */
    static async getFacultySchedule(facultyProfileId: string, date: string, endDate?: string) {
        await ensureTables();
        const end = endDate || date;
        const res = await db.query(
            `SELECT ts.*,
                    s.name as subject_name, s.code as subject_code,
                    sec.name as section_name,
                    cr.name as room_name, cr.building,
                    COALESCE(u.name, fp.employee_code) as faculty_name
             FROM timetable_sessions ts
             LEFT JOIN subjects s ON ts.subject_id = s.id
             LEFT JOIN sections sec ON ts.section_id = sec.id
             LEFT JOIN classrooms cr ON ts.classroom_id = cr.id
             LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
             LEFT JOIN users u ON fp.user_id = u.id
             WHERE ts.faculty_profile_id = $1
               AND ts.session_date >= $2 AND ts.session_date <= $3
               AND ts.session_status NOT IN ('CANCELLED')
             ORDER BY ts.session_date, ts.slot_start`,
            [facultyProfileId, date, end]
        );
        return res.rows;
    }

    /**
     * Get overview metrics for a university.
     */
    static async getOverviewMetrics(universityId: string) {
        await ensureTables();
        const today = new Date().toISOString().split('T')[0];

        const [totalRes, completedRes, conflictRes, todayRes] = await Promise.all([
            db.query(`SELECT COUNT(*) as total FROM timetable_sessions WHERE university_id = $1 AND session_status != 'CANCELLED'`, [universityId]),
            db.query(`SELECT COUNT(*) as completed FROM timetable_sessions WHERE university_id = $1 AND session_status = 'COMPLETED'`, [universityId]),
            db.query(`SELECT COUNT(*) as conflicts FROM scheduling_conflicts WHERE university_id = $1 AND resolution_status = 'OPEN'`, [universityId]),
            db.query(
                `SELECT ts.*, s.name as subject_name, s.code as subject_code,
                        sec.name as section_name, cr.name as room_name,
                        COALESCE(u.name, fp.employee_code) as faculty_name
                 FROM timetable_sessions ts
                 LEFT JOIN subjects s ON ts.subject_id = s.id
                 LEFT JOIN sections sec ON ts.section_id = sec.id
                 LEFT JOIN classrooms cr ON ts.classroom_id = cr.id
                 LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                 LEFT JOIN users u ON fp.user_id = u.id
                 WHERE ts.university_id = $1 AND ts.session_date = $2
                   AND ts.session_status NOT IN ('CANCELLED')
                 ORDER BY ts.slot_start`,
                [universityId, today]
            )
        ]);

        return {
            totalSessions: parseInt(totalRes.rows[0].total),
            completedSessions: parseInt(completedRes.rows[0].completed),
            openConflicts: parseInt(conflictRes.rows[0].conflicts),
            todaySessions: todayRes.rows
        };
    }

    /**
     * Get all conflicts for a university.
     */
    static async getAllConflicts(universityId: string, timetableVersionId?: string) {
        await ensureTables();
        let query = `SELECT sc.*, ts.session_date, ts.slot_start, ts.slot_end,
                            s.name as subject_name, sec.name as section_name,
                            COALESCE(u.name, fp.employee_code) as faculty_name
                     FROM scheduling_conflicts sc
                     LEFT JOIN timetable_sessions ts ON sc.timetable_session_id = ts.id
                     LEFT JOIN subjects s ON ts.subject_id = s.id
                     LEFT JOIN sections sec ON ts.section_id = sec.id
                     LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                     LEFT JOIN users u ON fp.user_id = u.id
                     WHERE sc.university_id = $1 AND sc.resolution_status = 'OPEN'`;
        const params: any[] = [universityId];

        if (timetableVersionId) {
            query += ` AND ts.timetable_version_id = $2`;
            params.push(timetableVersionId);
        }

        query += ` ORDER BY sc.created_at DESC`;
        const res = await db.query(query, params);
        return res.rows;
    }

    /**
     * Create a timetable version.
     */
    static async createVersion(data: {
        university_id: string;
        program_id?: string;
        term_id?: string;
        section_id?: string;
        source_type?: string;
        notes?: string;
    }) {
        await ensureTables();
        // Get next version number
        const countRes = await db.query(
            `SELECT COALESCE(MAX(version_number), 0) + 1 as next FROM timetable_versions WHERE university_id = $1`,
            [data.university_id]
        );
        const nextVersion = countRes.rows[0].next;

        const res = await db.query(
            `INSERT INTO timetable_versions (university_id, program_id, term_id, section_id, version_number, version_status, source_type, notes)
             VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7)
             RETURNING *`,
            [data.university_id, data.program_id || null, data.term_id || null, data.section_id || null,
             nextVersion, data.source_type || 'UPLOAD', data.notes || null]
        );
        return res.rows[0];
    }

    /**
     * Get timetable versions for a university.
     */
    static async getVersions(universityId: string, termId?: string) {
        await ensureTables();
        let query = `SELECT tv.*,
                            p.name as program_name,
                            t.name as term_name,
                            sec.name as section_name,
                            (SELECT COUNT(*) FROM timetable_sessions ts WHERE ts.timetable_version_id = tv.id) as session_count
                     FROM timetable_versions tv
                     LEFT JOIN programs p ON tv.program_id = p.id
                     LEFT JOIN terms t ON tv.term_id = t.id
                     LEFT JOIN sections sec ON tv.section_id = sec.id
                     WHERE tv.university_id = $1`;
        const params: any[] = [universityId];
        if (termId) {
            query += ` AND tv.term_id = $2`;
            params.push(termId);
        }
        query += ` ORDER BY tv.created_at DESC`;
        const res = await db.query(query, params);
        return res.rows;
    }

    /**
     * Publish a timetable version.
     */
    static async publishTimetable(universityId: string, timetableVersionId: string, actorId: string) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const versionRes = await client.query('SELECT * FROM timetable_versions WHERE id = $1', [timetableVersionId]);
            if (versionRes.rows.length === 0) throw new Error("Version not found.");

            // Archive any previously published version for the same scope
            const v = versionRes.rows[0];
            await client.query(
                `UPDATE timetable_versions SET version_status = 'ARCHIVED', updated_at = NOW()
                 WHERE university_id = $1 AND version_status = 'PUBLISHED' AND id != $2
                   AND (program_id = $3 OR $3 IS NULL) AND (term_id = $4 OR $4 IS NULL)`,
                [universityId, timetableVersionId, v.program_id, v.term_id]
            );

            // Mark version as published
            await client.query(
                `UPDATE timetable_versions SET version_status = 'PUBLISHED', published_at = NOW(), published_by = $2, updated_at = NOW()
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

    /**
     * Mark a session as conducted.
     */
    static async markSessionConducted(sessionId: string, markedBy: string, notes?: string) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE timetable_sessions SET session_status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
                [sessionId]
            );
            await client.query(
                `INSERT INTO session_execution_logs (timetable_session_id, execution_status, completion_notes, marked_by)
                 VALUES ($1, 'COMPLETED', $2, $3)`,
                [sessionId, notes || null, markedBy]
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

    /**
     * Get university time slots.
     */
    static async getSlots(universityId: string) {
        await ensureTables();
        const res = await db.query(
            `SELECT * FROM university_slots WHERE university_id = $1 AND is_active = true ORDER BY start_time`,
            [universityId]
        );
        return res.rows;
    }

    /**
     * Create or update university slots from timetable import.
     */
    static async upsertSlots(universityId: string, slots: { name: string; start_time: string; end_time: string; slot_type: string }[]) {
        await ensureTables();
        const created: any[] = [];
        for (const slot of slots) {
            const res = await db.query(
                `INSERT INTO university_slots (university_id, name, start_time, end_time, slot_type)
                 VALUES ($1, $2, $3::TIME, $4::TIME, $5)
                 ON CONFLICT (university_id, start_time, end_time) DO UPDATE SET name = $2, slot_type = $5
                 RETURNING *`,
                [universityId, slot.name, slot.start_time, slot.end_time, slot.slot_type]
            );
            created.push(res.rows[0]);
        }
        return created;
    }
}
