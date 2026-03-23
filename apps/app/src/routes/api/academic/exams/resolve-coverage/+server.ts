import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    const batchId = url.searchParams.get('batchId');
    const semesterNumber = url.searchParams.get('semesterNumber');

    if (!universityId || !batchId || !semesterNumber) {
        throw error(400, 'universityId, batchId, semesterNumber required');
    }

    const semNum = parseInt(semesterNumber);

    // 1. Find all terms for this university with matching semester_number
    const termsResult = await db.query(
        `SELECT t.id, t.name, t.program_id, p.name as program_name
         FROM terms t
         JOIN programs p ON t.program_id = p.id
         WHERE t.university_id = $1 AND t.semester_number = $2 AND t.is_active = true
         ORDER BY p.name`,
        [universityId, semNum]
    );

    if (termsResult.rows.length === 0) {
        return json({ programs: [], total_students: 0, total_subjects: 0, term_ids: [] });
    }

    const coverage: any[] = [];
    let totalStudents = 0;
    let totalSubjects = 0;
    const termIds: string[] = [];

    for (const term of termsResult.rows) {
        termIds.push(term.id);

        // Find sections in this program that belong to this batch
        const sectionsResult = await db.query(
            `SELECT s.id, s.name, s.strength,
                    (SELECT COUNT(*)::int FROM student_profiles sp WHERE sp.section_id = s.id) as student_count
             FROM sections s
             WHERE s.program_id = $1 AND s.batch_id = $2 AND s.is_active = true
             ORDER BY s.name`,
            [term.program_id, batchId]
        );

        // Also check sections matching term_id if batch_id match is empty
        let sections = sectionsResult.rows;
        if (sections.length === 0) {
            const fallback = await db.query(
                `SELECT s.id, s.name, s.strength,
                        (SELECT COUNT(*)::int FROM student_profiles sp WHERE sp.section_id = s.id) as student_count
                 FROM sections s
                 WHERE s.program_id = $1 AND s.term_id = $2 AND s.is_active = true
                 ORDER BY s.name`,
                [term.program_id, term.id]
            );
            sections = fallback.rows;
        }

        if (sections.length === 0) continue;

        // Count subjects for this term
        const subjectsResult = await db.query(
            `SELECT COUNT(*)::int as count FROM subjects WHERE program_id = $1 AND term_id = $2 AND is_active = true`,
            [term.program_id, term.id]
        );
        let subjectCount = subjectsResult.rows[0]?.count || 0;

        // Fallback: subjects for just the program
        if (subjectCount === 0) {
            const fallback = await db.query(
                `SELECT COUNT(*)::int as count FROM subjects WHERE program_id = $1 AND is_active = true`,
                [term.program_id]
            );
            subjectCount = fallback.rows[0]?.count || 0;
        }

        const sectionStudents = sections.reduce((sum: number, s: any) => sum + (s.student_count || s.strength || 0), 0);
        totalStudents += sectionStudents;
        totalSubjects += subjectCount;

        coverage.push({
            program_id: term.program_id,
            program_name: term.program_name,
            term_id: term.id,
            term_name: term.name,
            subjects: subjectCount,
            sections: sections.map((s: any) => ({
                id: s.id,
                name: s.name,
                students: s.student_count || s.strength || 0
            })),
            total_students: sectionStudents
        });
    }

    return json({
        programs: coverage,
        total_students: totalStudents,
        total_subjects: totalSubjects,
        term_ids: termIds
    });
};
