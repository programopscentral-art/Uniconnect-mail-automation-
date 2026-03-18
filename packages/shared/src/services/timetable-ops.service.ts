import { db } from '../db/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionEditInput {
    faculty_profile_id?: string | null;
    classroom_id?: string | null;
    delivery_mode?: string;
    planned_topic?: string;
    session_status?: string;
}

export interface ChangeLogEntry {
    id: string;
    session_id: string;
    version_id: string;
    change_type: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
    changed_at: string;
    // joined fields
    subject_code?: string;
    section_name?: string;
    session_date?: string;
    slot_start?: string;
    changer_name?: string;
}

export interface VersionDiffEntry {
    session_date: string;
    slot_start: string;
    slot_end: string;
    section_name: string;
    subject_code: string;
    field: string;
    v1_value: string | null;
    v2_value: string | null;
}

export interface WeekSummary {
    id: string;
    week_start: string;
    week_end: string;
    week_number: number;
    generation_source: string;
    version_id: string | null;
    version_status: string | null;
    session_count: number;
    published_at: string | null;
}

// ─── Auto-migration ──────────────────────────────────────────────────────────

let _migrated = false;
async function ensureTables() {
    if (_migrated) return;
    try {
        // Change log table (may already exist from migration 0061)
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_change_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timetable_session_id UUID REFERENCES timetable_sessions(id) ON DELETE CASCADE,
                timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE CASCADE,
                change_type TEXT NOT NULL,
                field_name TEXT,
                old_value TEXT,
                new_value TEXT,
                changed_by UUID REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_change_logs_version ON timetable_change_logs(timetable_version_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_change_logs_session ON timetable_change_logs(timetable_session_id)`);

        // Timetable weeks table
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_weeks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                apd_plan_id UUID,
                week_start DATE NOT NULL,
                week_end DATE NOT NULL,
                week_number INTEGER DEFAULT 1,
                generation_source TEXT DEFAULT 'MANUAL',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(university_id, week_start, week_end)
            )
        `);
        _migrated = true;
    } catch { _migrated = true; }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TimetableOpsService {

    // ─── Week Operations ──────────────────────────────────────────────

    /**
     * List weeks for a university, with session counts.
     */
    static async getWeeks(universityId: string, options?: { termId?: string; limit?: number }): Promise<WeekSummary[]> {
        await ensureTables();
        const res = await db.query(`
            SELECT tw.*,
                   tv.version_status,
                   tv.published_at,
                   (SELECT COUNT(*) FROM timetable_sessions ts
                    WHERE ts.university_id = tw.university_id
                      AND ts.session_date >= tw.week_start AND ts.session_date <= tw.week_end
                      AND ts.session_status != 'CANCELLED') as session_count
            FROM timetable_weeks tw
            LEFT JOIN timetable_versions tv ON tw.timetable_version_id = tv.id
            WHERE tw.university_id = $1
            ORDER BY tw.week_start DESC
            LIMIT $2
        `, [universityId, options?.limit || 52]);
        return res.rows.map(r => ({
            id: r.id,
            week_start: r.week_start?.toISOString?.()?.split('T')[0] || r.week_start,
            week_end: r.week_end?.toISOString?.()?.split('T')[0] || r.week_end,
            week_number: r.week_number,
            generation_source: r.generation_source,
            version_id: r.timetable_version_id,
            version_status: r.version_status,
            session_count: parseInt(r.session_count) || 0,
            published_at: r.published_at
        }));
    }

    /**
     * Get sessions for a specific week.
     */
    static async getWeekSessions(universityId: string, weekStart: string, weekEnd: string, filters?: { sectionId?: string; versionId?: string }) {
        await ensureTables();
        let query = `
            SELECT ts.*,
                   s.name as subject_name, s.code as subject_code,
                   sec.name as section_name, sec.batch_code,
                   cr.name as room_name, cr.building,
                   COALESCE(u.name, fp.employee_code) as faculty_name
            FROM timetable_sessions ts
            LEFT JOIN subjects s ON ts.subject_id = s.id
            LEFT JOIN sections sec ON ts.section_id = sec.id
            LEFT JOIN classrooms cr ON ts.classroom_id = cr.id
            LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
            LEFT JOIN users u ON fp.user_id = u.id
            WHERE ts.university_id = $1
              AND ts.session_date >= $2 AND ts.session_date <= $3
              AND ts.session_status != 'CANCELLED'
        `;
        const params: any[] = [universityId, weekStart, weekEnd];

        if (filters?.sectionId) {
            query += ` AND ts.section_id = $${params.length + 1}`;
            params.push(filters.sectionId);
        }
        if (filters?.versionId) {
            query += ` AND ts.timetable_version_id = $${params.length + 1}`;
            params.push(filters.versionId);
        }

        query += ` ORDER BY ts.session_date, ts.slot_start, sec.batch_code`;
        const res = await db.query(query, params);
        return res.rows;
    }

    /**
     * Clone sessions from one week to another, creating a new version.
     */
    static async cloneWeek(
        universityId: string,
        sourceWeekStart: string,
        sourceWeekEnd: string,
        targetWeekStart: string,
        targetWeekEnd: string,
        createdBy?: string
    ) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Load source sessions
            const sourceRes = await client.query(`
                SELECT * FROM timetable_sessions
                WHERE university_id = $1 AND session_date >= $2 AND session_date <= $3
                  AND session_status != 'CANCELLED'
                ORDER BY session_date, slot_start
            `, [universityId, sourceWeekStart, sourceWeekEnd]);

            if (sourceRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'No sessions in source week to clone' };
            }

            // Create a new version
            const countRes = await client.query(
                `SELECT COALESCE(MAX(version_number), 0) + 1 as next FROM timetable_versions WHERE university_id = $1`,
                [universityId]
            );
            const versionRes = await client.query(`
                INSERT INTO timetable_versions (university_id, program_id, term_id, version_number, version_status, source_type, notes)
                VALUES ($1, $2, $3, $4, 'DRAFT', 'CLONED', $5) RETURNING *
            `, [
                universityId,
                sourceRes.rows[0].program_id,
                sourceRes.rows[0].term_id,
                countRes.rows[0].next,
                `Cloned from week ${sourceWeekStart} to ${targetWeekStart}`
            ]);
            const version = versionRes.rows[0];

            // Calculate date offset
            const srcStart = new Date(sourceWeekStart);
            const tgtStart = new Date(targetWeekStart);
            const dayOffset = Math.round((tgtStart.getTime() - srcStart.getTime()) / (1000 * 60 * 60 * 24));

            // Clone each session with shifted dates
            let clonedCount = 0;
            for (const src of sourceRes.rows) {
                const srcDate = new Date(src.session_date);
                const newDate = new Date(srcDate);
                newDate.setDate(srcDate.getDate() + dayOffset);
                const newDateStr = newDate.toISOString().split('T')[0];

                await client.query(`
                    INSERT INTO timetable_sessions (
                        timetable_version_id, university_id, program_id, term_id, section_id,
                        subject_id, faculty_profile_id, classroom_id,
                        session_date, slot_start, slot_end, delivery_mode,
                        planned_topic, planned_sequence_no, session_status
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SCHEDULED')
                `, [
                    version.id, universityId, src.program_id, src.term_id, src.section_id,
                    src.subject_id, src.faculty_profile_id, src.classroom_id,
                    newDateStr, src.slot_start, src.slot_end, src.delivery_mode,
                    src.planned_topic, src.planned_sequence_no
                ]);
                clonedCount++;
            }

            // Create timetable_week record
            await client.query(`
                INSERT INTO timetable_weeks (university_id, timetable_version_id, week_start, week_end, generation_source)
                VALUES ($1, $2, $3, $4, 'CLONED')
                ON CONFLICT (university_id, week_start, week_end) DO UPDATE SET
                    timetable_version_id = $2, generation_source = 'CLONED', updated_at = NOW()
            `, [universityId, version.id, targetWeekStart, targetWeekEnd]);

            // Log the clone action
            await client.query(`
                INSERT INTO timetable_change_logs (timetable_version_id, change_type, field_name, new_value, changed_by)
                VALUES ($1, 'CLONE_WEEK', 'source_week', $2, $3)
            `, [version.id, `${sourceWeekStart} to ${sourceWeekEnd}`, createdBy || null]);

            await client.query('COMMIT');

            return {
                success: true,
                version,
                clonedCount,
                message: `Cloned ${clonedCount} sessions to week ${targetWeekStart}`
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // ─── Session Edit ─────────────────────────────────────────────────

    /**
     * Edit a single timetable session with change tracking.
     */
    static async editSession(sessionId: string, updates: SessionEditInput, changedBy?: string) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Get current session
            const curRes = await client.query(`
                SELECT ts.*, COALESCE(u.name, fp.employee_code) as faculty_name
                FROM timetable_sessions ts
                LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                LEFT JOIN users u ON fp.user_id = u.id
                WHERE ts.id = $1
            `, [sessionId]);
            if (curRes.rows.length === 0) {
                await client.query('ROLLBACK');
                throw new Error('Session not found');
            }
            const current = curRes.rows[0];

            // Build SET clause and track changes
            const sets: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            const trackableFields: (keyof SessionEditInput)[] = [
                'faculty_profile_id', 'classroom_id', 'delivery_mode', 'planned_topic', 'session_status'
            ];

            for (const field of trackableFields) {
                if (field in updates && updates[field] !== current[field]) {
                    sets.push(`${field} = $${paramIdx}`);
                    params.push(updates[field] ?? null);
                    paramIdx++;

                    // Log change
                    let oldVal = current[field] || null;
                    let newVal = updates[field] || null;

                    // For faculty changes, resolve names
                    if (field === 'faculty_profile_id') {
                        if (updates.faculty_profile_id) {
                            const nameRes = await client.query(
                                `SELECT COALESCE(u.name, fp.employee_code) as name
                                 FROM faculty_profiles fp LEFT JOIN users u ON fp.user_id = u.id WHERE fp.id = $1`,
                                [updates.faculty_profile_id]
                            );
                            newVal = nameRes.rows[0]?.name || updates.faculty_profile_id;
                        }
                        oldVal = current.faculty_name || oldVal;
                    }

                    await client.query(`
                        INSERT INTO timetable_change_logs (timetable_session_id, timetable_version_id, change_type, field_name, old_value, new_value, changed_by)
                        VALUES ($1, $2, 'EDIT', $3, $4, $5, $6)
                    `, [sessionId, current.timetable_version_id, field, String(oldVal), String(newVal), changedBy || null]);
                }
            }

            if (sets.length === 0) {
                await client.query('ROLLBACK');
                return current;
            }

            sets.push(`updated_at = NOW()`);
            params.push(sessionId);
            const updateRes = await client.query(
                `UPDATE timetable_sessions SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
                params
            );

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel a session with change tracking.
     */
    static async cancelSession(sessionId: string, changedBy?: string) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const curRes = await client.query(`SELECT * FROM timetable_sessions WHERE id = $1`, [sessionId]);
            if (curRes.rows.length === 0) throw new Error('Session not found');
            const current = curRes.rows[0];

            await client.query(
                `UPDATE timetable_sessions SET session_status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
                [sessionId]
            );

            await client.query(`
                INSERT INTO timetable_change_logs (timetable_session_id, timetable_version_id, change_type, field_name, old_value, new_value, changed_by)
                VALUES ($1, $2, 'CANCEL', 'session_status', $3, 'CANCELLED', $4)
            `, [sessionId, current.timetable_version_id, current.session_status, changedBy || null]);

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
     * Swap faculty between two sessions.
     */
    static async swapFaculty(sessionId1: string, sessionId2: string, changedBy?: string) {
        await ensureTables();
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const [s1Res, s2Res] = await Promise.all([
                client.query(`SELECT * FROM timetable_sessions WHERE id = $1`, [sessionId1]),
                client.query(`SELECT * FROM timetable_sessions WHERE id = $1`, [sessionId2])
            ]);
            if (s1Res.rows.length === 0 || s2Res.rows.length === 0) throw new Error('Session not found');

            const s1 = s1Res.rows[0];
            const s2 = s2Res.rows[0];

            await client.query(`UPDATE timetable_sessions SET faculty_profile_id = $1, updated_at = NOW() WHERE id = $2`, [s2.faculty_profile_id, sessionId1]);
            await client.query(`UPDATE timetable_sessions SET faculty_profile_id = $1, updated_at = NOW() WHERE id = $2`, [s1.faculty_profile_id, sessionId2]);

            // Log both swaps
            for (const [sid, old_fid, new_fid, vid] of [
                [sessionId1, s1.faculty_profile_id, s2.faculty_profile_id, s1.timetable_version_id],
                [sessionId2, s2.faculty_profile_id, s1.faculty_profile_id, s2.timetable_version_id]
            ]) {
                await client.query(`
                    INSERT INTO timetable_change_logs (timetable_session_id, timetable_version_id, change_type, field_name, old_value, new_value, changed_by)
                    VALUES ($1, $2, 'SWAP_FACULTY', 'faculty_profile_id', $3, $4, $5)
                `, [sid, vid, old_fid || 'none', new_fid || 'none', changedBy || null]);
            }

            await client.query('COMMIT');
            return true;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // ─── Publish / Version Management ─────────────────────────────────

    /**
     * Get version detail with session stats.
     */
    static async getVersionDetail(versionId: string) {
        await ensureTables();
        const res = await db.query(`
            SELECT tv.*,
                   p.name as program_name, t.name as term_name,
                   COALESCE(pu.name, '') as publisher_name,
                   (SELECT COUNT(*) FROM timetable_sessions ts WHERE ts.timetable_version_id = tv.id AND ts.session_status != 'CANCELLED') as session_count,
                   (SELECT COUNT(*) FROM timetable_sessions ts WHERE ts.timetable_version_id = tv.id AND ts.faculty_profile_id IS NULL AND ts.session_status != 'CANCELLED') as unassigned_count,
                   (SELECT COUNT(*) FROM timetable_change_logs cl WHERE cl.timetable_version_id = tv.id) as change_count
            FROM timetable_versions tv
            LEFT JOIN programs p ON tv.program_id = p.id
            LEFT JOIN terms t ON tv.term_id = t.id
            LEFT JOIN users pu ON tv.published_by = pu.id
            WHERE tv.id = $1
        `, [versionId]);
        return res.rows[0] || null;
    }

    /**
     * Diff two versions.
     */
    static async diffVersions(versionId1: string, versionId2: string): Promise<VersionDiffEntry[]> {
        await ensureTables();
        // Get all sessions from both versions, keyed by (section_id, session_date, slot_start)
        const [v1Res, v2Res] = await Promise.all([
            db.query(`
                SELECT ts.*, s.code as subject_code, sec.name as section_name,
                       COALESCE(u.name, fp.employee_code, '') as faculty_name
                FROM timetable_sessions ts
                LEFT JOIN subjects s ON ts.subject_id = s.id
                LEFT JOIN sections sec ON ts.section_id = sec.id
                LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                LEFT JOIN users u ON fp.user_id = u.id
                WHERE ts.timetable_version_id = $1 AND ts.session_status != 'CANCELLED'
            `, [versionId1]),
            db.query(`
                SELECT ts.*, s.code as subject_code, sec.name as section_name,
                       COALESCE(u.name, fp.employee_code, '') as faculty_name
                FROM timetable_sessions ts
                LEFT JOIN subjects s ON ts.subject_id = s.id
                LEFT JOIN sections sec ON ts.section_id = sec.id
                LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                LEFT JOIN users u ON fp.user_id = u.id
                WHERE ts.timetable_version_id = $1 AND ts.session_status != 'CANCELLED'
            `, [versionId2])
        ]);

        const key = (r: any) => `${r.section_id}_${r.session_date}_${r.slot_start}`;
        const v1Map = new Map(v1Res.rows.map(r => [key(r), r]));
        const v2Map = new Map(v2Res.rows.map(r => [key(r), r]));
        const allKeys = new Set([...v1Map.keys(), ...v2Map.keys()]);

        const diffs: VersionDiffEntry[] = [];

        for (const k of allKeys) {
            const s1 = v1Map.get(k);
            const s2 = v2Map.get(k);
            const base = s1 || s2;
            const dateStr = base.session_date?.toISOString?.()?.split('T')[0] || String(base.session_date);

            if (!s1) {
                diffs.push({
                    session_date: dateStr,
                    slot_start: base.slot_start, slot_end: base.slot_end,
                    section_name: base.section_name, subject_code: base.subject_code || '',
                    field: 'session', v1_value: null, v2_value: 'ADDED'
                });
                continue;
            }
            if (!s2) {
                diffs.push({
                    session_date: dateStr,
                    slot_start: base.slot_start, slot_end: base.slot_end,
                    section_name: base.section_name, subject_code: base.subject_code || '',
                    field: 'session', v1_value: 'EXISTS', v2_value: null
                });
                continue;
            }

            // Compare fields
            const compareFields = [
                { field: 'subject', v1: s1.subject_code, v2: s2.subject_code },
                { field: 'faculty', v1: s1.faculty_name, v2: s2.faculty_name },
                { field: 'delivery_mode', v1: s1.delivery_mode, v2: s2.delivery_mode },
            ];
            for (const cf of compareFields) {
                if (cf.v1 !== cf.v2) {
                    diffs.push({
                        session_date: dateStr,
                        slot_start: base.slot_start, slot_end: base.slot_end,
                        section_name: base.section_name, subject_code: s1.subject_code || s2.subject_code || '',
                        field: cf.field, v1_value: cf.v1 || null, v2_value: cf.v2 || null
                    });
                }
            }
        }

        return diffs.sort((a, b) => a.session_date.localeCompare(b.session_date) || a.slot_start.localeCompare(b.slot_start));
    }

    // ─── Change Log ───────────────────────────────────────────────────

    /**
     * Get change logs for a university, optionally filtered by version.
     */
    static async getChangeLogs(universityId: string, options?: { versionId?: string; limit?: number }): Promise<ChangeLogEntry[]> {
        await ensureTables();
        let query = `
            SELECT cl.*,
                   s.code as subject_code, sec.name as section_name,
                   ts.session_date::text, ts.slot_start::text,
                   u.name as changer_name
            FROM timetable_change_logs cl
            LEFT JOIN timetable_sessions ts ON cl.timetable_session_id = ts.id
            LEFT JOIN subjects s ON ts.subject_id = s.id
            LEFT JOIN sections sec ON ts.section_id = sec.id
            LEFT JOIN users u ON cl.changed_by = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (options?.versionId) {
            params.push(options.versionId);
            query += ` AND cl.timetable_version_id = $${params.length}`;
        } else {
            // Filter by university via the version
            params.push(universityId);
            query += ` AND cl.timetable_version_id IN (SELECT id FROM timetable_versions WHERE university_id = $${params.length})`;
        }

        query += ` ORDER BY cl.created_at DESC LIMIT $${params.length + 1}`;
        params.push(options?.limit || 100);

        const res = await db.query(query, params);
        return res.rows.map(r => ({
            id: r.id,
            session_id: r.timetable_session_id,
            version_id: r.timetable_version_id,
            change_type: r.change_type,
            field_name: r.field_name,
            old_value: r.old_value,
            new_value: r.new_value,
            changed_by: r.changed_by,
            changed_at: r.created_at,
            subject_code: r.subject_code,
            section_name: r.section_name,
            session_date: r.session_date,
            slot_start: r.slot_start,
            changer_name: r.changer_name
        }));
    }

    // --- Topic Tracking ---

    static async getTopicProgress(sectionId: string, subjectId: string) {
        const result = await db.query(
            `SELECT id, date, slot_start, slot_end, planned_topic, planned_sequence_no,
                    session_status, delivery_mode
             FROM timetable_sessions
             WHERE section_id = $1 AND subject_id = $2
             ORDER BY planned_sequence_no NULLS LAST, date, slot_start`,
            [sectionId, subjectId]
        );
        const sessions = result.rows;
        const completed = sessions.filter(s => s.session_status === 'COMPLETED').length;
        const total = sessions.length;
        const missed = sessions.filter(s => s.session_status === 'MISSED' || s.session_status === 'CANCELLED').length;

        return {
            sessions,
            completed,
            total,
            missed,
            coverage_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
            topics: sessions.map(s => ({
                topic: s.planned_topic || `Session ${s.planned_sequence_no || '?'}`,
                status: s.session_status,
                date: s.date,
                slot: s.slot_start,
                session_id: s.id
            }))
        };
    }

    static async shiftMissedTopics(sectionId: string, subjectId: string) {
        // Get all sessions ordered by date
        const result = await db.query(
            `SELECT id, date, slot_start, planned_topic, planned_sequence_no, session_status
             FROM timetable_sessions
             WHERE section_id = $1 AND subject_id = $2
             ORDER BY date, slot_start`,
            [sectionId, subjectId]
        );
        const sessions = result.rows;

        // Collect missed topics
        const missedTopics: string[] = [];
        for (const s of sessions) {
            if ((s.session_status === 'MISSED' || s.session_status === 'CANCELLED') && s.planned_topic) {
                missedTopics.push(s.planned_topic);
            }
        }
        if (missedTopics.length === 0) return { shifted: 0 };

        // Find upcoming SCHEDULED sessions
        const upcoming = sessions.filter(s => s.session_status === 'SCHEDULED');
        let shifted = 0;

        // Cascade: push missed topics into upcoming sessions
        for (let i = 0; i < missedTopics.length && i < upcoming.length; i++) {
            const existingTopic = upcoming[i].planned_topic;
            await db.query(
                `UPDATE timetable_sessions SET planned_topic = $1 WHERE id = $2`,
                [missedTopics[i], upcoming[i].id]
            );
            // Push displaced topic to the end
            if (existingTopic && i + 1 < upcoming.length) {
                missedTopics.push(existingTopic);
            }
            shifted++;
        }

        return { shifted, remaining: Math.max(0, missedTopics.length - upcoming.length) };
    }
}
