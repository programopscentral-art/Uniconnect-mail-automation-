import { db } from './client';

export interface Student {
    id: string;
    university_id: string;
    name: string;
    full_name?: string;
    email: string;
    external_id: string;
    metadata: any;
    created_by?: string;
    created_at: Date;
}

export async function getStudents(options: { universityId?: string; userId?: string; limit?: number; offset?: number }) {
    const { universityId, userId, limit = 100, offset = 0 } = options;

    let query = `SELECT * FROM students`;
    const conditions: string[] = [];
    const params: any[] = [];

    if (universityId) {
        conditions.push(`university_id = $${params.length + 1}`);
        params.push(universityId);
    }

    if (userId) {
        conditions.push(`created_by = $${params.length + 1}`);
        params.push(userId);
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows as Student[];
}

export async function getStudentsCount(universityId?: string, userId?: string) {
    let query = `SELECT COUNT(*) as count FROM students`;
    const conditions: string[] = [];
    const params: any[] = [];

    if (universityId) {
        conditions.push(`university_id = $${params.length + 1}`);
        params.push(universityId);
    }

    if (userId) {
        conditions.push(`created_by = $${params.length + 1}`);
        params.push(userId);
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
}

export async function createStudent(data: { university_id: string; name: string; email: string; external_id: string; created_by?: string; metadata?: any; sort_order?: number }) {
    const result = await db.query(
        `INSERT INTO students (university_id, name, email, external_id, created_by, metadata, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.university_id, data.name, data.email, data.external_id, data.created_by || null, data.metadata || {}, data.sort_order || 0]
    );
    return result.rows[0] as Student;
}

export async function createStudentsBulk(students: Array<{ university_id: string; name: string; email: string; external_id: string; created_by?: string; metadata?: any; sort_order?: number }>) {
    if (students.length === 0) return;

    // Dedupe against BOTH unique constraints on the students table:
    //   UNIQUE(university_id, external_id) — matches the ON CONFLICT clause below
    //   UNIQUE(university_id, email)
    // The INSERT writes `external_id || email` as the external_id (so rows
    // missing an external_id fall back to email), and the dedup must use that
    // same effective value or Postgres throws "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" when the file has duplicate IDs.
    // Last-write-wins so a later row in the file overrides an earlier one.
    // Build the dedup key from the SAME expression the INSERT uses below
    // (`String(s.external_id || s.email).trim()`) so the in-memory dedup
    // matches Postgres' case-sensitive uniqueness exactly — otherwise we
    // could collapse case-variants here that the DB would treat as distinct.
    const byExtId = new Map<string, typeof students[0]>();
    for (const s of students) {
        const effectiveExtId = String(s.external_id || s.email || '').trim();
        if (!effectiveExtId) continue;
        byExtId.set(`${s.university_id}:${effectiveExtId}`, s);
    }

    // Second pass guards the (university_id, email) UNIQUE constraint —
    // without it the INSERT throws "duplicate key value violates unique
    // constraint" when two surviving rows share an email but differ on
    // external_id.
    const byEmail = new Map<string, typeof students[0]>();
    for (const s of byExtId.values()) {
        const emailKey = `${s.university_id}:${s.email.trim().toLowerCase()}`;
        byEmail.set(emailKey, s);
    }

    const uniqueStudents = Array.from(byEmail.values());
    const dropped = students.length - uniqueStudents.length;
    if (dropped > 0) {
        console.warn(`[createStudentsBulk] dropped ${dropped} duplicate rows (${students.length} → ${uniqueStudents.length}); last-write-wins on (university, external_id) and (university, email)`);
    }

    // Build multi-row insert query
    // This is significantly faster for large imports
    const values: any[] = [];
    const placeholders: string[] = [];

    uniqueStudents.forEach((s, i) => {
        const offset = i * 7;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
        values.push(
            s.university_id,
            s.name.trim(),
            s.email.trim().toLowerCase(),
            String(s.external_id || s.email).trim(),
            s.created_by || null,
            s.metadata || {},
            s.sort_order || 0
        );
    });

    const query = `
        INSERT INTO students (university_id, name, email, external_id, created_by, metadata, sort_order) 
        VALUES ${placeholders.join(', ')} 
        ON CONFLICT (university_id, external_id) DO UPDATE SET 
            name = EXCLUDED.name, 
            email = EXCLUDED.email,
            created_by = EXCLUDED.created_by,
            metadata = EXCLUDED.metadata,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
    `;

    await db.query(query, values);
}

export async function deleteStudent(id: string, universityId: string) {
    await db.query(`DELETE FROM students WHERE id = $1 AND university_id = $2`, [id, universityId]);
}

export async function deleteAllStudents(universityId: string, userId?: string) {
    let query = `DELETE FROM students WHERE university_id = $1`;
    const params = [universityId];
    if (userId) {
        query += ` AND created_by = $2`;
        params.push(userId);
    }
    await db.query(query, params);
}

export async function getMetadataKeys(universityId: string): Promise<string[]> {
    // High-performance JSONB key extraction from the last 100 students
    const result = await db.query(
        `SELECT DISTINCT jsonb_object_keys(metadata) as key 
         FROM (SELECT metadata FROM students WHERE university_id = $1 ORDER BY created_at DESC LIMIT 100) s`,
        [universityId]
    );
    return result.rows.map((r: any) => r.key);
}
