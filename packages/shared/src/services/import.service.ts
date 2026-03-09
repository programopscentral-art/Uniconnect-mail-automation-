import { db } from '../db/client';
import { AcademicService } from './academic.service';

export interface BulkImportResult {
    success: number;
    failed: number;
    errors: string[];
}

export class AcademicImportService {
    /**
     * Bulk Ingest Students for a specific section.
     */
    static async importStudents(universityId: string, programId: string, termId: string, sectionId: string, students: any[]) {
        const result: BulkImportResult = { success: 0, failed: 0, errors: [] };

        for (const s of students) {
            try {
                // Check if user exists, else create
                let userRes = await db.query('SELECT id FROM users WHERE email = $1', [s.email]);
                let userId: string;

                if (userRes.rows.length === 0) {
                    const newUser = await db.query(
                        `INSERT INTO users (email, name, role) VALUES ($1, $2, 'STUDENT') RETURNING id`,
                        [s.email, s.name]
                    );
                    userId = newUser.rows[0].id;
                } else {
                    userId = userRes.rows[0].id;
                }

                // Associate with Student Profile
                await db.query(
                    `INSERT INTO student_profiles (user_id, university_id, program_id, term_id, section_id, enrollment_number, status)
                     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
                     ON CONFLICT (user_id, university_id) DO UPDATE 
                     SET section_id = $5, term_id = $4`,
                    [userId, universityId, programId, termId, sectionId, s.enrollment_number]
                );
                result.success++;
            } catch (err: any) {
                result.failed++;
                result.errors.push(`Student ${s.email}: ${err.message}`);
            }
        }
        return result;
    }

    /**
     * Bulk Ingest Faculty for a university.
     */
    static async importFaculty(universityId: string, faculty_list: any[]) {
        const result: BulkImportResult = { success: 0, failed: 0, errors: [] };

        for (const f of faculty_list) {
            try {
                let userRes = await db.query('SELECT id FROM users WHERE email = $1', [f.email]);
                let userId: string;

                if (userRes.rows.length === 0) {
                    const newUser = await db.query(
                        `INSERT INTO users (email, name, role) VALUES ($1, $2, 'FACULTY') RETURNING id`,
                        [f.email, f.name]
                    );
                    userId = newUser.rows[0].id;
                } else {
                    userId = userRes.rows[0].id;
                    await db.query(`UPDATE users SET role = 'FACULTY' WHERE id = $1`, [userId]);
                }

                await db.query(
                    `INSERT INTO faculty_profiles (user_id, university_id, employee_code, department, status)
                     VALUES ($1, $2, $3, $4, 'ACTIVE')
                     ON CONFLICT (user_id, university_id) DO UPDATE 
                     SET employee_code = $3, department = $4`,
                    [userId, universityId, f.employee_code, f.department]
                );
                result.success++;
            } catch (err: any) {
                result.failed++;
                result.errors.push(`Faculty ${f.email}: ${err.message}`);
            }
        }
        return result;
    }

    /**
     * Bulk Ingest Subjects for a term.
     */
    static async importSubjects(universityId: string, programId: string, termId: string, subjects: any[]) {
        const result: BulkImportResult = { success: 0, failed: 0, errors: [] };

        for (const s of subjects) {
            try {
                await AcademicService.createSubject(universityId, programId, termId, {
                    name: s.name,
                    code: s.code,
                    credit_value: Number(s.credit_value),
                    total_sessions: Number(s.total_sessions_required)
                });
                result.success++;
            } catch (err: any) {
                result.failed++;
                result.errors.push(`Subject ${s.code}: ${err.message}`);
            }
        }
        return result;
    }
}
