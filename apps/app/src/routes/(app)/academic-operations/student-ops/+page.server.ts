import { db } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = locals.user.university_id;
    if (!universityId) return { students: [], programs: [], total: 0 };

    const programId = url.searchParams.get('programId') || '';
    const termId    = url.searchParams.get('termId') || '';
    const search    = url.searchParams.get('search') || '';

    // Load programs + terms for filters
    const [programsRes, termsRes] = await Promise.all([
        db.query(`SELECT id, name, code FROM programs WHERE university_id = $1 AND is_active = true ORDER BY name ASC`, [universityId]),
        termId
            ? db.query(`SELECT id, name FROM terms WHERE program_id = $1 AND is_active = true ORDER BY name ASC`, [programId])
            : programId
                ? db.query(`SELECT id, name FROM terms WHERE program_id = $1 AND is_active = true ORDER BY name ASC`, [programId])
                : db.query(
                    `SELECT DISTINCT t.id, t.name FROM terms t
                     JOIN programs p ON p.id = t.program_id
                     WHERE p.university_id = $1 AND t.is_active = true ORDER BY t.name ASC`,
                    [universityId]
                )
    ]);

    const conditions: string[] = [`sp.university_id = $1`];
    const params: any[] = [universityId];

    if (programId) {
        conditions.push(`sp.program_id = $${params.length + 1}`);
        params.push(programId);
    }
    if (termId) {
        conditions.push(`sp.term_id = $${params.length + 1}`);
        params.push(termId);
    }
    if (search) {
        conditions.push(`(u.name ILIKE $${params.length + 1} OR sp.enrollment_number ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [studentsRes, countRes] = await Promise.all([
        db.query(
            `SELECT sp.id, sp.enrollment_number, sp.student_status, sp.admission_date,
                    COALESCE(u.name, sp.enrollment_number) as name,
                    COALESCE(u.email, '') as email,
                    COALESCE(u.phone, '') as phone,
                    p.name as program_name, p.code as program_code,
                    t.name as term_name,
                    s.name as section_name
             FROM student_profiles sp
             LEFT JOIN users u ON sp.user_id = u.id
             LEFT JOIN programs p ON sp.program_id = p.id
             LEFT JOIN terms t ON sp.term_id = t.id
             LEFT JOIN sections s ON sp.section_id = s.id
             WHERE ${where}
             ORDER BY p.code ASC, sp.enrollment_number ASC
             LIMIT 500`,
            params
        ),
        db.query(`SELECT COUNT(*) as count FROM student_profiles sp WHERE ${where}`, params)
    ]);

    return {
        students: studentsRes.rows,
        programs: programsRes.rows,
        terms: termsRes.rows,
        total: parseInt(countRes.rows[0]?.count ?? '0'),
        filters: { programId, termId, search }
    };
};
