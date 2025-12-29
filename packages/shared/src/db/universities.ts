import { db } from './client';

export interface University {
    id: string;
    name: string;
    slug: string;
    short_name: string | null;
    email_domain: string | null;
    created_at: Date;
    updated_at: Date;
}

export async function getAllUniversities() {
    const result = await db.query(`SELECT * FROM universities ORDER BY name ASC`);
    return result.rows as University[];
}

export async function createUniversity(name: string, slug: string, email_domain?: string) {
    const result = await db.query(
        `INSERT INTO universities (name, slug, email_domain) VALUES ($1, $2, $3) RETURNING *`,
        [name, slug, email_domain || null]
    );
    return result.rows[0] as University;
}

export async function deleteUniversity(id: string) {
    await db.query(`DELETE FROM universities WHERE id = $1`, [id]);
}

export async function getUniversityById(id: string) {
    const result = await db.query(`SELECT * FROM universities WHERE id = $1`, [id]);
    return result.rows[0] as University | null;
}
