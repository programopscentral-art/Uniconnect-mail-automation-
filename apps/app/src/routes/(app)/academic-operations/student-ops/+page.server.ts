import { db, getAllUniversities } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';

// Run DDL once at boot, not per request
let schemaReady = false;
async function ensureStudentOpsSchema() {
    if (schemaReady) return;
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
    await db.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES academic_batches(id) ON DELETE SET NULL`);
    // Add indexes for fast JOINs if they don't exist
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_university_id ON student_profiles(university_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_program_id ON student_profiles(program_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_term_id ON student_profiles(term_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_section_id ON student_profiles(section_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_batch_id ON student_profiles(batch_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_user_id ON student_profiles(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sp_enrollment ON student_profiles(enrollment_number)`);
    schemaReady = true;
}

export const load = async ({ locals, url }: { locals: App.Locals, url: URL }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const isGlobal = locals.user.permissions?.includes('universities');
    const universities = isGlobal ? await getAllUniversities() : [];

    // University: from query param (admin) or from user's own university
    const universityId = url.searchParams.get('universityId')
        || locals.user.university_id
        || '';

    const emptyResult = { students: [], programs: [], terms: [], batches: [], total: 0, universities, filters: { universityId: '', programId: '', termId: '', batchId: '', search: '' } };

    if (!universityId) return emptyResult;

    const programId = url.searchParams.get('programId') || '';
    const termId    = url.searchParams.get('termId') || '';
    const batchId   = url.searchParams.get('batchId') || '';
    const search    = url.searchParams.get('search') || '';

    // Schema setup moved to ensureStudentOpsSchema() — called once at boot, not per request
    await ensureStudentOpsSchema();

    const [programsRes, termsRes, batchesRes] = await Promise.all([
        db.query(`SELECT id, name, code FROM programs WHERE university_id = $1 AND is_active = true ORDER BY name ASC`, [universityId]),
        programId
            ? db.query(`SELECT id, name FROM terms WHERE program_id = $1 AND is_active = true ORDER BY name ASC`, [programId])
            : db.query(
                `SELECT DISTINCT ON (t.name) t.id, t.name FROM terms t
                 JOIN programs p ON p.id = t.program_id
                 WHERE p.university_id = $1 AND t.is_active = true ORDER BY t.name ASC, t.id ASC`,
                [universityId]
              ),
        db.query(
            `SELECT id, name, start_year, end_year FROM academic_batches WHERE university_id = $1 AND is_active = true ORDER BY start_year DESC`,
            [universityId]
        )
    ]);

    // Auto-seed: if no batches exist but students do, create 2025-2029 batch and assign all unassigned students
    let batches = batchesRes.rows;
    if (batches.length === 0) {
        const studentCount = await db.query(`SELECT COUNT(*) as cnt FROM student_profiles WHERE university_id = $1`, [universityId]);
        if (parseInt(studentCount.rows[0]?.cnt || '0') > 0) {
            const seedRes = await db.query(
                `INSERT INTO academic_batches (university_id, name, start_year, end_year)
                 VALUES ($1, '2025-2029', 2025, 2029)
                 ON CONFLICT (university_id, start_year, end_year) DO UPDATE SET is_active = true
                 RETURNING id, name, start_year, end_year`,
                [universityId]
            );
            const newBatchId = seedRes.rows[0]?.id;
            if (newBatchId) {
                await db.query(
                    `UPDATE student_profiles SET batch_id = $1 WHERE university_id = $2 AND (batch_id IS NULL)`,
                    [newBatchId, universityId]
                );
                batches = seedRes.rows;
            }
        }
    }

    const conditions: string[] = [`sp.university_id = $1`];
    const params: any[] = [universityId];

    if (programId) { conditions.push(`sp.program_id = $${params.length + 1}`); params.push(programId); }
    if (termId)    { conditions.push(`sp.term_id = $${params.length + 1}`);    params.push(termId); }
    if (batchId)   { conditions.push(`sp.batch_id = $${params.length + 1}`);   params.push(batchId); }
    if (search) {
        conditions.push(`(u.name ILIKE $${params.length + 1} OR sp.enrollment_number ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    // Single query with COUNT(*) OVER() — eliminates duplicate count query
    const studentsRes = await db.query(
        `SELECT sp.id, sp.enrollment_number, sp.student_status, sp.admission_date,
                COALESCE(u.name, sp.enrollment_number) as name,
                COALESCE(u.email, '') as email,
                COALESCE(u.phone, '') as phone,
                p.name as program_name, p.code as program_code,
                t.name as term_name,
                s.name as section_name,
                ab.name as batch_name,
                COUNT(*) OVER() as total_count
         FROM student_profiles sp
         LEFT JOIN users u ON sp.user_id = u.id
         LEFT JOIN programs p ON sp.program_id = p.id
         LEFT JOIN terms t ON sp.term_id = t.id
         LEFT JOIN sections s ON sp.section_id = s.id
         LEFT JOIN academic_batches ab ON sp.batch_id = ab.id
         WHERE ${where}
         ORDER BY p.code ASC, sp.enrollment_number ASC
         LIMIT 500`,
        params
    );

    const total = parseInt(studentsRes.rows[0]?.total_count ?? '0');

    return {
        students: studentsRes.rows,
        programs: programsRes.rows,
        terms: termsRes.rows,
        batches,
        total,
        universities,
        filters: { universityId, programId, termId, batchId, search }
    };
};
