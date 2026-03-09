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

    // --- Program Management ---

    static async createProgram(data: Omit<Program, 'id'>) {
        const result = await db.query(
            `INSERT INTO programs (university_id, campus_id, name, code, degree_type, semester_count, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
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
}
