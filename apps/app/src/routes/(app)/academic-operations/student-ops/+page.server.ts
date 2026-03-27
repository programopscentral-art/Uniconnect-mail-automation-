import { db, getAllUniversities } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';

const PAGE_SIZE = 50;

export const load = async ({ locals, url }: { locals: App.Locals, url: URL }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const isGlobal = locals.user.permissions?.includes('universities');
    const universities = isGlobal ? await getAllUniversities() : [];

    const universityId = url.searchParams.get('universityId')
        || locals.user.university_id
        || '';

    const emptyResult = { students: [], programs: [], terms: [], batches: [], total: 0, page: 1, pageSize: PAGE_SIZE, universities, filters: { universityId: '', programId: '', termId: '', batchId: '', search: '' } };

    if (!universityId) return emptyResult;

    const programId = url.searchParams.get('programId') || '';
    const termId    = url.searchParams.get('termId') || '';
    const batchId   = url.searchParams.get('batchId') || '';
    const search    = url.searchParams.get('search') || '';
    const page      = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

    // All filter queries + student query in parallel
    const conditions: string[] = [`sp.university_id = $1`, `sp.is_active = true`];
    const params: any[] = [universityId];

    if (programId) { conditions.push(`sp.program_id = $${params.length + 1}`); params.push(programId); }
    if (termId)    { conditions.push(`sp.term_id = $${params.length + 1}`);    params.push(termId); }
    if (batchId)   { conditions.push(`sp.batch_id = $${params.length + 1}`);   params.push(batchId); }
    if (search) {
        conditions.push(`(u.name ILIKE $${params.length + 1} OR sp.enrollment_number ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * PAGE_SIZE;
    params.push(PAGE_SIZE);
    params.push(offset);

    const [programsRes, termsRes, batchesRes, studentsRes] = await Promise.all([
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
        ),
        db.query(
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
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        )
    ]);

    // Auto-seed batch if none exist
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

    const total = parseInt(studentsRes.rows[0]?.total_count ?? '0');

    return {
        students: studentsRes.rows,
        programs: programsRes.rows,
        terms: termsRes.rows,
        batches,
        total,
        page,
        pageSize: PAGE_SIZE,
        universities,
        filters: { universityId, programId, termId, batchId, search }
    };
};
