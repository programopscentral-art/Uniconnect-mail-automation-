import { db } from '../db/client';

export interface UniversityConfig {
    id: string;
    name: string;
    slug: string;
    short_code?: string;
    type?: 'FEDERAL' | 'STATE' | 'PRIVATE' | 'DEEMED';
    timezone?: string;
    status: string;
}

export interface Campus {
    id: string;
    university_id: string;
    name: string;
    code: string;
    address?: string;
    status: string;
}

export interface Program {
    id: string;
    university_id: string;
    campus_id?: string;
    name: string;
    code: string;
    degree_type?: string;
    semester_count?: number;
    status: string;
}

export class AcademicService {
    // --- University Management ---

    static async getUniversity(id: string) {
        const result = await db.query('SELECT * FROM universities WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async updateUniversityOperationalData(id: string, data: Partial<UniversityConfig>) {
        const fields = [];
        const values = [];
        let i = 1;

        if (data.short_code) { fields.push(`short_code = $${i++}`); values.push(data.short_code); }
        if (data.type) { fields.push(`type = $${i++}`); values.push(data.type); }
        if (data.timezone) { fields.push(`timezone = $${i++}`); values.push(data.timezone); }
        if (data.status) { fields.push(`status = $${i++}`); values.push(data.status); }

        if (fields.length === 0) return;

        values.push(id);
        await db.query(
            `UPDATE universities SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
            values
        );
    }

    // --- Campus Management ---

    static async createCampus(data: Omit<Campus, 'id'>) {
        const result = await db.query(
            `INSERT INTO campuses (university_id, name, code, address, status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (university_id, code) DO UPDATE SET
                 name = EXCLUDED.name,
                 address = COALESCE(EXCLUDED.address, campuses.address),
                 is_active = true,
                 updated_at = NOW()
             RETURNING *`,
            [data.university_id, data.name, data.code, data.address, data.status]
        );
        return result.rows[0] as Campus;
    }

    static async getCampuses(universityId: string) {
        const result = await db.query(
            'SELECT * FROM campuses WHERE university_id = $1 AND is_active = true ORDER BY name ASC',
            [universityId]
        );
        return result.rows as Campus[];
    }

    static async deleteCampus(id: string) {
        await db.query('UPDATE campuses SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    }

    static async updateCampus(id: string, data: Partial<Campus>) {
        const fields = [];
        const values = [];
        let i = 1;

        if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
        if (data.code) { fields.push(`code = $${i++}`); values.push(data.code); }
        if (data.address) { fields.push(`address = $${i++}`); values.push(data.address); }
        if (data.status) { fields.push(`status = $${i++}`); values.push(data.status); }

        if (fields.length === 0) return;

        values.push(id);
        await db.query(
            `UPDATE campuses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
            values
        );
    }

    // --- Program Management ---

    static async createProgram(data: Omit<Program, 'id'>) {
        const result = await db.query(
            `INSERT INTO programs (university_id, campus_id, name, code, degree_type, semester_count, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (university_id, code) DO UPDATE SET
                 name = EXCLUDED.name,
                 degree_type = COALESCE(EXCLUDED.degree_type, programs.degree_type),
                 semester_count = COALESCE(EXCLUDED.semester_count, programs.semester_count),
                 is_active = true,
                 updated_at = NOW()
             RETURNING *`,
            [data.university_id, data.campus_id, data.name, data.code, data.degree_type, data.semester_count, data.status]
        );
        return result.rows[0] as Program;
    }

    static async getPrograms(universityId: string, campusId?: string) {
        let query = 'SELECT * FROM programs WHERE university_id = $1 AND is_active = true';
        const params: any[] = [universityId];

        if (campusId) {
            query += ' AND campus_id = $2';
            params.push(campusId);
        }

        query += ' ORDER BY name ASC';
        const result = await db.query(query, params);
        return result.rows as Program[];
    }

    static async deleteProgram(id: string) {
        await db.query('UPDATE programs SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    }

    static async updateProgram(id: string, data: Partial<Program>) {
        const fields = [];
        const values = [];
        let i = 1;

        if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
        if (data.code) { fields.push(`code = $${i++}`); values.push(data.code); }
        if (data.degree_type) { fields.push(`degree_type = $${i++}`); values.push(data.degree_type); }
        if (data.semester_count) { fields.push(`semester_count = $${i++}`); values.push(data.semester_count); }
        if (data.status) { fields.push(`status = $${i++}`); values.push(data.status); }

        if (fields.length === 0) return;

        values.push(id);
        await db.query(
            `UPDATE programs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
            values
        );
    }

    // --- Term / Semester Management ---

    static async createTerm(universityId: string, programId: string, data: { name: string; start_date: Date; end_date: Date }) {
        const result = await db.query(
            `INSERT INTO terms (university_id, program_id, name, start_date, end_date, status)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
             RETURNING *`,
            [universityId, programId, data.name, data.start_date, data.end_date]
        );
        return result.rows[0];
    }

    static async getTerms(programId: string) {
        const result = await db.query(
            'SELECT * FROM terms WHERE program_id = $1 AND is_active = true ORDER BY start_date DESC',
            [programId]
        );
        return result.rows;
    }

    static async deleteTerm(id: string) {
        await db.query('UPDATE terms SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    }

    static async updateTerm(id: string, data: { name?: string; start_date?: Date; end_date?: Date; status?: string }) {
        const fields = [];
        const values = [];
        let i = 1;

        if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
        if (data.start_date) { fields.push(`start_date = $${i++}`); values.push(data.start_date); }
        if (data.end_date) { fields.push(`end_date = $${i++}`); values.push(data.end_date); }
        if (data.status) { fields.push(`status = $${i++}`); values.push(data.status); }

        if (fields.length === 0) return;

        values.push(id);
        await db.query(
            `UPDATE terms SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
            values
        );
    }

    // --- Section / Batch Management ---

    static async createSection(universityId: string, programId: string, termId: string, data: { name: string; batch_code: string; strength: number }) {
        const result = await db.query(
            `INSERT INTO sections (university_id, program_id, term_id, name, batch_code, strength, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
             RETURNING *`,
            [universityId, programId, termId, data.name, data.batch_code, data.strength]
        );
        return result.rows[0];
    }

    static async getSections(termId: string) {
        const result = await db.query(
            'SELECT * FROM sections WHERE term_id = $1 AND is_active = true ORDER BY name ASC',
            [termId]
        );
        return result.rows;
    }

    // --- Subject Management ---

    static async createSubject(universityId: string, programId: string, termId: string, data: { name: string; code?: string; credit_value?: number; total_sessions?: number }) {
        // Auto-generate code from name if not provided (e.g. "Data Structures" → "DATA-STRUCTURES")
        const code = (data.code?.trim() || data.name.replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase()).slice(0, 20);
        const result = await db.query(
            `INSERT INTO subjects (university_id, program_id, term_id, name, code, credit_value, total_sessions_required, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
             ON CONFLICT (term_id, code) DO UPDATE SET
                 name = EXCLUDED.name,
                 is_active = true,
                 updated_at = NOW()
             RETURNING *`,
            [universityId, programId, termId, data.name, code, data.credit_value || 0, data.total_sessions || 30]
        );
        return result.rows[0];
    }

    static async getSubjects(termId: string) {
        const result = await db.query(
            'SELECT * FROM subjects WHERE term_id = $1 AND is_active = true ORDER BY name ASC',
            [termId]
        );
        return result.rows;
    }

    // --- Cloning & Bulk Ops ---

    /**
     * Clones an entire academic term's structure (Subjects & Sections) to a new term.
     * Used to reduce manual setup between semesters.
     */
    static async cloneTerm(sourceTermId: string, targetTermId: string, universityId: string, programId: string) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // 1. Fetch source data
            const [subjectsRes, sectionsRes] = await Promise.all([
                client.query('SELECT * FROM subjects WHERE term_id = $1 AND is_active = true', [sourceTermId]),
                client.query('SELECT * FROM sections WHERE term_id = $1 AND is_active = true', [sourceTermId])
            ]);

            // 2. Clone Subjects
            for (const sub of subjectsRes.rows) {
                await client.query(
                    `INSERT INTO subjects (university_id, program_id, term_id, name, code, credit_value, total_sessions_required, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [universityId, programId, targetTermId, sub.name, sub.code, sub.credit_value, sub.total_sessions_required, 'ACTIVE']
                );
            }

            // 3. Clone Sections
            for (const sec of sectionsRes.rows) {
                await client.query(
                    `INSERT INTO sections (university_id, program_id, term_id, name, batch_code, strength, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [universityId, programId, targetTermId, sec.name, sec.batch_code, sec.strength, 'ACTIVE']
                );
            }

            await client.query('COMMIT');
            return { subjects: subjectsRes.rows.length, sections: sectionsRes.rows.length };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}
