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

        // Filter valid rows upfront
        const valid = students.filter(s => s.name && s.enrollment_number);
        const invalid = students.filter(s => !s.name || !s.enrollment_number);
        for (const s of invalid) {
            results.failed++;
            results.errors.push(`Row missing name or NIAT ID: ${JSON.stringify(s)}`);
        }

        if (!valid.length) return results;

        const emailToUserId = new Map<string, string>();

        try {
            // --- Step 1: Batch upsert users (one query for all students with emails) ---
            const withEmail = valid.filter(s => s.email?.trim());

            if (withEmail.length > 0) {
                // Single INSERT ... ON CONFLICT for all users at once
                const values = withEmail.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
                const params: any[] = withEmail.flatMap(s => [s.email.trim().toLowerCase(), s.name.trim(), universityId, 'ACTIVE']);
                const userRes = await db.query(
                    `INSERT INTO users (email, full_name, role, university_id, status)
                     SELECT v.email, v.full_name, 'STUDENT', v.university_id::uuid, v.status
                     FROM (VALUES ${values}) AS v(email, full_name, university_id, status)
                     ON CONFLICT (email) DO UPDATE SET
                         full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), users.full_name),
                         updated_at = NOW()
                     RETURNING id, email`,
                    params
                );
                for (const row of userRes.rows) emailToUserId.set(row.email.toLowerCase(), row.id);

                // Also fetch existing users whose email conflict prevented RETURNING
                const emails = withEmail.map(s => s.email.trim().toLowerCase());
                const existRes = await db.query(
                    `SELECT id, email FROM users WHERE email = ANY($1)`,
                    [emails]
                );
                for (const row of existRes.rows) emailToUserId.set(row.email.toLowerCase(), row.id);
            }

            // --- Step 2: Batch upsert student_profiles ---
            const profileValues = valid.map((_, i) => {
                const base = i * 7;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, 'ENROLLED')`;
            }).join(', ');
            const profileParams: any[] = valid.flatMap(s => [
                emailToUserId.get(s.email?.trim().toLowerCase()) || null,
                universityId,
                programId,
                termId,
                sectionId,
                s.enrollment_number.trim(),
                s.admission_date || today
            ]);

            await db.query(
                `INSERT INTO student_profiles (user_id, university_id, program_id, term_id, section_id, enrollment_number, admission_date, student_status)
                 VALUES ${profileValues}
                 ON CONFLICT (university_id, enrollment_number) DO UPDATE SET
                     program_id = EXCLUDED.program_id,
                     term_id = EXCLUDED.term_id,
                     section_id = EXCLUDED.section_id,
                     user_id = COALESCE(student_profiles.user_id, EXCLUDED.user_id),
                     updated_at = NOW()`,
                profileParams
            );

            // --- Step 3: Batch role assignments for users we have IDs for ---
            const userIds = [...emailToUserId.values()];
            if (userIds.length > 0) {
                const roleValues = userIds.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}::uuid, $${i * 4 + 3}::uuid, $${i * 4 + 4}::uuid)`).join(', ');
                const roleParams: any[] = userIds.flatMap(uid => [uid, universityId, programId, sectionId]);
                await db.query(
                    `INSERT INTO user_role_assignments (user_id, role_id, university_id, program_id, section_id, is_primary)
                     SELECT v.user_id::uuid, r.id, v.university_id, v.program_id, v.section_id, TRUE
                     FROM (VALUES ${roleValues}) AS v(user_id, university_id, program_id, section_id)
                     CROSS JOIN roles r WHERE r.code = 'student'
                     ON CONFLICT DO NOTHING`,
                    roleParams
                );
            }

            results.success = valid.length;
        } catch (e: any) {
            // If batch fails, fall back to row-by-row for error isolation
            for (const studentData of valid) {
                try {
                    let userId: string | null = emailToUserId?.get(studentData.email?.trim().toLowerCase()) || null;
                    if (!userId && studentData.email?.trim()) {
                        const existRes = await db.query('SELECT id FROM users WHERE email = $1', [studentData.email.trim().toLowerCase()]);
                        userId = existRes.rows[0]?.id || null;
                        if (!userId) {
                            const ins = await db.query(
                                `INSERT INTO users (email, full_name, role, university_id, status) VALUES ($1, $2, 'STUDENT', $3, 'ACTIVE') RETURNING id`,
                                [studentData.email.trim().toLowerCase(), studentData.name, universityId]
                            );
                            userId = ins.rows[0].id;
                        }
                    }
                    await db.query(
                        `INSERT INTO student_profiles (user_id, university_id, program_id, term_id, section_id, enrollment_number, admission_date, student_status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ENROLLED')
                         ON CONFLICT (university_id, enrollment_number) DO UPDATE SET
                            program_id = EXCLUDED.program_id, term_id = EXCLUDED.term_id,
                            section_id = EXCLUDED.section_id,
                            user_id = COALESCE(student_profiles.user_id, EXCLUDED.user_id),
                            updated_at = NOW()`,
                        [userId, universityId, programId, termId, sectionId, studentData.enrollment_number.trim(), studentData.admission_date || today]
                    );
                    results.success++;
                } catch (rowErr: any) {
                    results.failed++;
                    results.errors.push(`${studentData.enrollment_number}: ${rowErr.message}`);
                }
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
