import { db } from '../db/client';

export interface StudentProfile {
    id: string;
    user_id?: string;
    university_id: string;
    program_id?: string;
    term_id?: string;
    section_id?: string;
    enrollment_number: string;
    admission_date?: Date;
    student_status: string;
}

export class StudentService {
    // --- Profile Management ---

    static async createProfile(data: Omit<StudentProfile, 'id'>) {
        const result = await db.query(
            `INSERT INTO student_profiles (user_id, university_id, program_id, term_id, section_id, enrollment_number, admission_date, student_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [data.user_id || null, data.university_id, data.program_id, data.term_id, data.section_id, data.enrollment_number, data.admission_date, data.student_status]
        );
        return result.rows[0] as StudentProfile;
    }

    static async getProfileByEnrollment(universityId: string, enrollmentNumber: string) {
        const result = await db.query(
            'SELECT * FROM student_profiles WHERE university_id = $1 AND enrollment_number = $2 AND is_active = true',
            [universityId, enrollmentNumber]
        );
        return result.rows[0] as StudentProfile | null;
    }

    static async getStudentsInSection(sectionId: string) {
        const result = await db.query(
            `SELECT sp.*, u.name as user_name, u.email as user_email
             FROM student_profiles sp
             LEFT JOIN users u ON sp.user_id = u.id
             WHERE sp.section_id = $1 AND sp.is_active = true
             ORDER BY sp.enrollment_number ASC`,
            [sectionId]
        );
        return result.rows;
    }

    // --- Status & Lifecycle ---

    static async updateStatus(studentProfileId: string, status: string) {
        await db.query(
            'UPDATE student_profiles SET student_status = $1, updated_at = NOW() WHERE id = $2',
            [status, studentProfileId]
        );
    }

    static async moveSection(studentProfileId: string, targetSectionId: string) {
        await db.query(
            'UPDATE student_profiles SET section_id = $1, updated_at = NOW() WHERE id = $2',
            [targetSectionId, studentProfileId]
        );
    }

    static async importStudents(universityId: string, programId: string, termId: string, sectionId: string, students: any[]) {
        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        for (const studentData of students) {
            try {
                let userId: string | null = null;

                if (studentData.email) {
                    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [studentData.email]);
                    if (existingUser.rows.length > 0) {
                        userId = existingUser.rows[0].id;
                    } else {
                        const userRes = await db.query(
                            `INSERT INTO users (email, full_name, role, university_id, status)
                             VALUES ($1, $2, 'STUDENT', $3, 'ACTIVE')
                             RETURNING id`,
                            [studentData.email, studentData.name, universityId]
                        );
                        userId = userRes.rows[0].id;
                    }
                }

                await db.query(
                    `INSERT INTO student_profiles (user_id, university_id, program_id, term_id, section_id, enrollment_number, admission_date, student_status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ENROLLED')
                     ON CONFLICT (university_id, enrollment_number) DO UPDATE SET
                        program_id = EXCLUDED.program_id,
                        term_id = EXCLUDED.term_id,
                        section_id = EXCLUDED.section_id,
                        user_id = COALESCE(student_profiles.user_id, EXCLUDED.user_id),
                        updated_at = NOW()`,
                    [
                        userId,
                        universityId,
                        programId,
                        termId,
                        sectionId,
                        studentData.enrollment_number,
                        studentData.admission_date || new Date().toISOString().split('T')[0]
                    ]
                );

                if (userId) {
                    await db.query(
                        `INSERT INTO user_role_assignments (user_id, role_id, university_id, program_id, section_id, is_primary)
                         SELECT $1, id, $2, $3, $4, TRUE FROM roles WHERE code = 'student'
                         ON CONFLICT DO NOTHING`,
                        [userId, universityId, programId, sectionId]
                    );
                }

                results.success++;
            } catch (e: any) {
                results.failed++;
                results.errors.push(`Failed to import student ${studentData.enrollment_number}: ${e.message}`);
            }
        }

        return results;
    }

    // --- Academic Performance (Placeholder for Exam Domain integration) ---

    static async getExamMarks(studentProfileId: string) {
        const result = await db.query(
            `SELECT m.*, e.exam_date, e.slot_start, s.name as subject_name
             FROM student_exam_marks m
             JOIN exams e ON m.exam_id = e.id
             JOIN subjects s ON e.subject_id = s.id
             WHERE m.student_profile_id = $1
             ORDER BY e.exam_date DESC`,
            [studentProfileId]
        );
        return result.rows;
    }
}
