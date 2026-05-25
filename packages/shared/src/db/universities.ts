import { db } from './client';

export interface University {
    id: string;
    name: string;
    slug: string;
    short_name: string | null;
    email_domain: string | null;
    is_team: boolean;
    created_at: Date;
    updated_at: Date;
}

// Teams (Central Team, CRM, Student Engagement) live in the universities table
// flagged is_team=true so user_universities can link members to them. They are
// NOT universities and must not appear in university dropdowns. Default-filter
// them out; pass { includeTeams: true } for the rare admin view that wants them.
export async function getAllUniversities(opts?: { teamId?: string; includeTeams?: boolean }) {
    const teamId = opts?.teamId;
    const includeTeams = opts?.includeTeams ?? false;

    if (teamId) {
        const result = await db.query(`
            SELECT DISTINCT u.*
            FROM universities u
            JOIN user_universities uu1 ON u.id = uu1.university_id
            JOIN user_universities uu2 ON uu1.user_id = uu2.user_id
            WHERE uu2.university_id = $1 AND u.is_team = false
            ORDER BY u.name ASC
        `, [teamId]);
        return result.rows as University[];
    }

    const whereClause = includeTeams ? '' : 'WHERE is_team = false';
    const result = await db.query(`SELECT * FROM universities ${whereClause} ORDER BY name ASC`);
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
