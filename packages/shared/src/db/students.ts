import { db } from './client';

export interface Student {
    id: string;
    university_id: string;
    name: string;
    full_name?: string;
    email: string;
    external_id: string;
    metadata: any;
    created_at: Date;
}

export async function getStudents(universityId?: string, limit = 100, offset = 0) {
    const query = universityId
        ? [`SELECT * FROM students WHERE university_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [universityId, limit, offset]]
        : [`SELECT * FROM students ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]];

    const result = await db.query(query[0] as string, query[1] as any[]);
    return result.rows as Student[];
}

export async function getStudentsCount(universityId?: string) {
    const query = universityId
        ? [`SELECT COUNT(*) as count FROM students WHERE university_id = $1`, [universityId]]
        : [`SELECT COUNT(*) as count FROM students`, []];

    const result = await db.query(query[0] as string, query[1] as any[]);
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

    // Deduplicate by (university_id, external_id) to support siblings with shared emails
    const uniqueStudentsMap = new Map();
    students.forEach(s => {
        const key = `${s.university_id}:${String(s.external_id || s.email).trim().toLowerCase()}`;
        uniqueStudentsMap.set(key, s); // Overwrites with latest occurrence
    });
    const uniqueStudents = Array.from(uniqueStudentsMap.values());

    // Build multi-row insert query
    // This is significantly faster for large imports
    const values: any[] = [];
    const placeholders: string[] = [];

    uniqueStudents.forEach((s, i) => {
        const offset = i * 6;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        values.push(
            s.university_id,
            s.name.trim(),
            s.email.trim().toLowerCase(),
            String(s.external_id || s.email).trim(),
            s.metadata || {},
            s.sort_order || 0
        );
    });

    const query = `
        INSERT INTO students (university_id, name, email, external_id, metadata, sort_order) 
        VALUES ${placeholders.join(', ')} 
        ON CONFLICT (university_id, external_id) DO UPDATE SET 
            name = EXCLUDED.name, 
            email = EXCLUDED.email,
            metadata = EXCLUDED.metadata,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
    `;

    await db.query(query, values);
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
