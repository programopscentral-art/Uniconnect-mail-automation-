import { db } from '../db/client';

export interface ExamPlan {
    id: string;
    university_id: string;
    program_id: string;
    term_id: string;
    exam_name: string;
    exam_type: 'INTERNAL' | 'SEMESTER_END' | 'BACKLOG';
    start_date: Date;
    end_date: Date;
    version_status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    published_at?: Date;
    published_by?: string;
}

export interface Exam {
    id: string;
    exam_plan_id: string;
    subject_id: string;
    section_id: string;
    exam_date: Date;
    slot_start: string;
    slot_end: string;
    classroom_id: string;
    exam_mode: string;
    exam_status: string;
}

export class ExamService {
    // --- Exam Planning ---

    static async createExamPlan(data: Omit<ExamPlan, 'id' | 'version_status'>) {
        const result = await db.query(
            `INSERT INTO exam_plans (university_id, program_id, term_id, exam_name, exam_type, start_date, end_date, version_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
             RETURNING *`,
            [data.university_id, data.program_id, data.term_id, data.exam_name, data.exam_type, data.start_date, data.end_date]
        );
        return result.rows[0] as ExamPlan;
    }

    static async addExamToPlan(data: Omit<Exam, 'id' | 'exam_status'>) {
        const result = await db.query(
            `INSERT INTO exams (exam_plan_id, subject_id, section_id, exam_date, slot_start, slot_end, classroom_id, exam_mode, exam_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED')
             RETURNING *`,
            [data.exam_plan_id, data.subject_id, data.section_id, data.exam_date, data.slot_start, data.slot_end, data.classroom_id, data.exam_mode]
        );
        return result.rows[0] as Exam;
    }

    static async publishExamPlan(planId: string, publishedBy: string) {
        const result = await db.query(
            `UPDATE exam_plans 
             SET version_status = 'PUBLISHED', published_at = NOW(), published_by = $2
             WHERE id = $1
             RETURNING *`,
            [planId, publishedBy]
        );
        return result.rows[0] as ExamPlan;
    }

    // --- Seating & Invigilation ---

    static async createSeatingPlan(examId: string, classroomId: string, seatingData: any, generatedBy: string) {
        const result = await db.query(
            `INSERT INTO exam_seating_plans (exam_id, classroom_id, seating_data_json, generated_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [examId, classroomId, JSON.stringify(seatingData), generatedBy]
        );
        return result.rows[0];
    }

    static async assignInvigilator(examId: string, facultyProfileId: string, assignedBy: string) {
        const result = await db.query(
            `INSERT INTO invigilation_assignments (exam_id, faculty_profile_id, assigned_by)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [examId, facultyProfileId, assignedBy]
        );
        return result.rows[0];
    }

    // --- Marks Management ---

    static async createMarksUploadBatch(examId: string, uploadedBy: string, source: string) {
        const result = await db.query(
            `INSERT INTO marks_upload_batches (exam_id, uploaded_by, upload_source, upload_status)
             VALUES ($1, $2, $3, 'PENDING')
             RETURNING *`,
            [examId, uploadedBy, source]
        );
        return result.rows[0];
    }

    static async uploadStudentMarks(examId: string, marksData: Array<{ studentProfileId: string, marks: number, enteredBy: string }>) {
        await db.query('BEGIN');
        try {
            for (const entry of marksData) {
                await db.query(
                    `INSERT INTO student_exam_marks (exam_id, student_profile_id, raw_marks, final_marks, marks_status, entered_by)
                     VALUES ($1, $2, $3, $3, 'DRAFT', $4)
                     ON CONFLICT (exam_id, student_profile_id) 
                     DO UPDATE SET raw_marks = EXCLUDED.raw_marks, final_marks = EXCLUDED.raw_marks, updated_at = NOW()`,
                    [examId, entry.studentProfileId, entry.marks, entry.enteredBy]
                );
            }
            await db.query('COMMIT');
        } catch (e) {
            await db.query('ROLLBACK');
            throw e;
        }
    }

    static async finalizeMarks(examId: string) {
        await db.query(
            `UPDATE student_exam_marks 
             SET marks_status = 'PUBLISHED', updated_at = NOW() 
             WHERE exam_id = $1`,
            [examId]
        );

        // Log result publication
        await db.query(
            `INSERT INTO result_publication_logs (exam_plan_id, publication_status, published_at)
             SELECT exam_plan_id, 'PUBLISHED', NOW() FROM exams WHERE id = $1 LIMIT 1`,
            [examId]
        );
    }

    // --- Retrieval ---

    static async getExamSchedule(planId: string) {
        const result = await db.query(
            `SELECT e.*, s.name as subject_name, s.code as subject_code, cl.name as classroom_name, sec.name as section_name
             FROM exams e
             JOIN subjects s ON e.subject_id = s.id
             JOIN classrooms cl ON e.classroom_id = cl.id
             JOIN sections sec ON e.section_id = sec.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start`,
            [planId]
        );
        return result.rows;
    }
}
