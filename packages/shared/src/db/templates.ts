import { db } from './client';

export interface Template {
    id: string;
    university_id: string | null;
    name: string;
    subject: string;
    html: string;
    config: any;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
}

export async function getTemplates(universityId?: string) {
    const whereClause = universityId ? `WHERE university_id = $1` : ``;
    const params = universityId ? [universityId] : [];

    const result = await db.query(
        `SELECT * FROM templates ${whereClause} ORDER BY created_at DESC`,
        params
    );
    return result.rows as Template[];
}

export async function getTemplateById(id: string) {
    const result = await db.query(`SELECT * FROM templates WHERE id = $1`, [id]);
    return result.rows[0] as Template | null;
}

export async function createTemplate(data: {
    university_id: string;
    name: string;
    subject: string;
    html: string;
    config?: any;
    created_by_user_id: string;
}) {
    const result = await db.query(
        `INSERT INTO templates (university_id, name, subject, html, config, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [data.university_id, data.name, data.subject, data.html, data.config || {}, data.created_by_user_id]
    );
    return result.rows[0] as Template;
}

export async function updateTemplate(id: string, data: { name?: string; subject?: string; html?: string; config?: any }) {
    // Dynamic update
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.subject) { fields.push(`subject = $${idx++}`); values.push(data.subject); }
    if (data.html) { fields.push(`html = $${idx++}`); values.push(data.html); }
    if (data.config) { fields.push(`config = $${idx++}`); values.push(data.config); }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await db.query(
        `UPDATE templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
    return result.rows[0] as Template;
}

export async function deleteTemplate(id: string) {
    await db.query(`DELETE FROM templates WHERE id = $1`, [id]);
}
