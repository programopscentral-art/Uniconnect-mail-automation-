import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';

// Ensure table exists (safe to call repeatedly)
async function ensureTable() {
    await db.query(`CREATE TABLE IF NOT EXISTS academic_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start_year INT NOT NULL,
        end_year INT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(university_id, start_year, end_year)
    )`);
    // Ensure student_profiles has batch_id
    await db.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL`);
}

// GET /api/academic/batches?universityId=X
export const GET = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    if (!universityId) return json([]);

    const result = await db.query(
        `SELECT id, university_id, name, start_year, end_year, is_active, created_at
         FROM academic_batches
         WHERE university_id = $1
         ORDER BY start_year DESC`,
        [universityId]
    );
    return json(result.rows);
};

// POST /api/academic/batches — create a new batch
export const POST = async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') throw error(403, 'Forbidden');
    await ensureTable();

    const { university_id, name, start_year, end_year } = await request.json();
    if (!university_id || !start_year || !end_year) throw error(400, 'university_id, start_year, end_year required');

    const batchName = name || `${start_year}-${end_year}`;

    const result = await db.query(
        `INSERT INTO academic_batches (university_id, name, start_year, end_year)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (university_id, start_year, end_year) DO UPDATE SET name = EXCLUDED.name, is_active = true
         RETURNING *`,
        [university_id, batchName, start_year, end_year]
    );
    return json(result.rows[0]);
};

// DELETE /api/academic/batches?id=X
export const DELETE = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') throw error(403, 'Forbidden');

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    await db.query('DELETE FROM academic_batches WHERE id = $1', [id]);
    return json({ success: true });
};
