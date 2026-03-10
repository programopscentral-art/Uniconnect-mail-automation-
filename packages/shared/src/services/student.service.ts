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
        const results = { success: 0, failed: 0, errors: [] as string[] };
        if (!students.length) return results;

        const today = new Date().toISOString().split('T')[0];
        const valid = students.filter(s => s.name?.trim() && s.enrollment_number?.trim());
        const skipped = students.length - valid.length;
        results.failed += skipped;
        for (let i = 0; i < skipped; i++) results.errors.push(`Row skipped — missing name or NIAT ID`);
        if (!valid.length) return results;

        // --- Step 1: Resolve user IDs for students with emails ---
        const emailToUserId = new Map<string, string>();
        const withEmail = valid.filter(s => s.email?.trim());

        if (withEmail.length > 0) {
            const emails = withEmail.map(s => s.email.trim().toLowerCase());

            // Fetch all existing users in one query
            const existRes = await db.query(
                `SELECT id, email FROM users WHERE email = ANY($1)`,
                [emails]
            );
            for (const row of existRes.rows) emailToUserId.set(row.email.toLowerCase(), row.id);

            // Insert only new users (those not found above) in one batch
            const newOnes = withEmail.filter(s => !emailToUserId.has(s.email.trim().toLowerCase()));
            if (newOnes.length > 0) {
                const vals = newOnes.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, 'STUDENT', $${i * 3 + 3})`).join(', ');
                const params = newOnes.flatMap(s => [s.email.trim().toLowerCase(), s.name.trim(), universityId]);
                const inserted = await db.query(
                    `INSERT INTO users (email, name, role, university_id)
                     VALUES ${vals}
                     ON CONFLICT (email) DO NOTHING
                     RETURNING id, email`,
                    params
                );
                for (const row of inserted.rows) emailToUserId.set(row.email.toLowerCase(), row.id);

                // Pick up any that already existed (race-condition safe)
                const stillMissing = newOnes
                    .filter(s => !emailToUserId.has(s.email.trim().toLowerCase()))
                    .map(s => s.email.trim().toLowerCase());
                if (stillMissing.length > 0) {
                    const recheck = await db.query(`SELECT id, email FROM users WHERE email = ANY($1)`, [stillMissing]);
                    for (const row of recheck.rows) emailToUserId.set(row.email.toLowerCase(), row.id);
                }
            }
        }

        // --- Step 2: Batch upsert student_profiles in one query ---
        const pVals = valid.map((_, i) =>
            `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7}, 'ENROLLED')`
        ).join(', ');
        const pParams = valid.flatMap(s => [
            emailToUserId.get(s.email?.trim().toLowerCase()) ?? null,
            universityId, programId, termId, sectionId,
            s.enrollment_number.trim(),
            today
        ]);
        await db.query(
            `INSERT INTO student_profiles
                 (user_id, university_id, program_id, term_id, section_id, enrollment_number, admission_date, student_status)
             VALUES ${pVals}
             ON CONFLICT (university_id, enrollment_number) DO UPDATE SET
                 program_id = EXCLUDED.program_id,
                 term_id    = EXCLUDED.term_id,
                 section_id = EXCLUDED.section_id,
                 user_id    = COALESCE(student_profiles.user_id, EXCLUDED.user_id),
                 updated_at = NOW()`,
            pParams
        );

        // --- Step 3: Batch role assignments ---
        const userIds = [...emailToUserId.values()];
        if (userIds.length > 0) {
            const studentRoleRes = await db.query(`SELECT id FROM roles WHERE code = 'student' LIMIT 1`);
            const studentRoleId = studentRoleRes.rows[0]?.id;
            if (studentRoleId) {
                const rVals = userIds.map((_, i) => `($${i + 1}, '${studentRoleId}', '${universityId}', '${programId}', '${sectionId}', TRUE)`).join(', ');
                await db.query(
                    `INSERT INTO user_role_assignments (user_id, role_id, university_id, program_id, section_id, is_primary)
                     VALUES ${rVals}
                     ON CONFLICT DO NOTHING`,
                    userIds
                );
            }
        }

        results.success = valid.length;
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
