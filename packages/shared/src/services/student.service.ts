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
