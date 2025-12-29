import { db } from './client';

export interface Student {
    id: string;
    university_id: string;
    name: string;
    email: string;
    external_id: string;
    metadata: any;
    created_at: Date;
}

export async function getStudents(universityId: string, limit = 100, offset = 0) {
    const result = await db.query(
        `SELECT * FROM students WHERE university_id = $1 ORDER BY sort_order ASC, created_at ASC LIMIT $2 OFFSET $3`,
        [universityId, limit, offset]
    );
    return result.rows as Student[];
}

export async function getStudentsCount(universityId: string) {
    const result = await db.query(`SELECT COUNT(*) as count FROM students WHERE university_id = $1`, [universityId]);
    return parseInt(result.rows[0].count);
}

export async function createStudent(data: { university_id: string; name: string; email: string; external_id: string; metadata?: any; sort_order?: number }) {
    const result = await db.query(
        `INSERT INTO students (university_id, name, email, external_id, metadata, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [data.university_id, data.name, data.email, data.external_id, data.metadata || {}, data.sort_order || 0]
    );
    return result.rows[0] as Student;
}

export async function createStudentsBulk(students: Array<{ university_id: string; name: string; email: string; external_id: string; metadata?: any; sort_order?: number }>) {
    if (students.length === 0) return;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        for (const s of students) {
            await client.query(
                `INSERT INTO students (university_id, name, email, external_id, metadata, sort_order) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT (university_id, email) DO UPDATE SET 
                    name = EXCLUDED.name, 
                    external_id = EXCLUDED.external_id,
                    metadata = EXCLUDED.metadata,
                    sort_order = EXCLUDED.sort_order,
                    updated_at = NOW()`,
                [s.university_id, s.name, s.email, s.external_id, s.metadata || {}, s.sort_order || 0]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function deleteStudent(id: string, universityId: string) {
    await db.query(`DELETE FROM students WHERE id = $1 AND university_id = $2`, [id, universityId]);
}

export async function deleteAllStudents(universityId: string) {
    await db.query(`DELETE FROM students WHERE university_id = $1`, [universityId]);
}

export async function getMetadataKeys(universityId: string): Promise<string[]> {
    // High-performance JSONB key extraction from the last 100 students
    const result = await db.query(
        `SELECT DISTINCT jsonb_object_keys(metadata) as key 
         FROM (SELECT metadata FROM students WHERE university_id = $1 ORDER BY created_at DESC LIMIT 100) s`,
        [universityId]
    );
    return result.rows.map(r => r.key);
}
