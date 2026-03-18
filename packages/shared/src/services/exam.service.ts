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

export interface SeatAssignment {
    bench_row: number;
    bench_col: number;
    seat: number;
    student_id: string;
    enrollment_no: string;
    student_name: string;
    section_id: string;
    section_name: string;
    program_name: string;
}

export class ExamService {
    // --- Exam Planning ---

    static async getExamPlans(universityId: string) {
        const result = await db.query(
            `SELECT ep.*, p.name as program_name, t.name as term_name,
                    (SELECT COUNT(*) FROM exams e WHERE e.exam_plan_id = ep.id) as exam_count
             FROM exam_plans ep
             LEFT JOIN programs p ON ep.program_id = p.id
             LEFT JOIN terms t ON ep.term_id = t.id
             WHERE ep.university_id = $1
             ORDER BY ep.created_at DESC`,
            [universityId]
        );
        return result.rows;
    }

    static async getExamPlan(planId: string) {
        const result = await db.query(
            `SELECT ep.*, p.name as program_name, t.name as term_name
             FROM exam_plans ep
             LEFT JOIN programs p ON ep.program_id = p.id
             LEFT JOIN terms t ON ep.term_id = t.id
             WHERE ep.id = $1`,
            [planId]
        );
        return result.rows[0] || null;
    }

    static async createExamPlan(data: Omit<ExamPlan, 'id' | 'version_status'>) {
        const result = await db.query(
            `INSERT INTO exam_plans (university_id, program_id, term_id, exam_name, exam_type, start_date, end_date, version_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
             RETURNING *`,
            [data.university_id, data.program_id, data.term_id, data.exam_name, data.exam_type, data.start_date, data.end_date]
        );
        return result.rows[0] as ExamPlan;
    }

    static async deleteExamPlan(planId: string) {
        await db.query(`DELETE FROM exam_plans WHERE id = $1`, [planId]);
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

    static async deleteExam(examId: string) {
        await db.query(`DELETE FROM exams WHERE id = $1`, [examId]);
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
        // Upsert — replace existing seating for same exam+classroom
        const result = await db.query(
            `INSERT INTO exam_seating_plans (exam_id, classroom_id, seating_data_json, generated_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (exam_id, classroom_id) DO UPDATE SET
                seating_data_json = EXCLUDED.seating_data_json,
                generated_by = EXCLUDED.generated_by,
                generated_at = NOW(),
                seating_version = exam_seating_plans.seating_version + 1
             RETURNING *`,
            [examId, classroomId, JSON.stringify(seatingData), generatedBy]
        );
        // If ON CONFLICT doesn't exist, do insert
        if (result.rows.length === 0) {
            const fallback = await db.query(
                `INSERT INTO exam_seating_plans (exam_id, classroom_id, seating_data_json, generated_by)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [examId, classroomId, JSON.stringify(seatingData), generatedBy]
            );
            return fallback.rows[0];
        }
        return result.rows[0];
    }

    static async getSeatingPlan(examId: string, classroomId?: string) {
        let query = `SELECT esp.*, c.name as classroom_name, c.bench_rows, c.bench_columns,
                            c.total_benches, c.seats_per_bench, c.capacity
                     FROM exam_seating_plans esp
                     JOIN classrooms c ON esp.classroom_id = c.id
                     WHERE esp.exam_id = $1`;
        const params: any[] = [examId];
        if (classroomId) {
            query += ` AND esp.classroom_id = $2`;
            params.push(classroomId);
        }
        const result = await db.query(query, params);
        return classroomId ? result.rows[0] : result.rows;
    }

    static async generateSeatingPlan(examPlanId: string, classroomIds: string[], generatedBy: string) {
        // 1. Get all exams in the plan grouped by (date, slot)
        const examsResult = await db.query(
            `SELECT e.*, s.name as subject_name, s.code as subject_code, sec.name as section_name,
                    sec.strength as section_strength
             FROM exams e
             JOIN subjects s ON e.subject_id = s.id
             JOIN sections sec ON e.section_id = sec.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start`,
            [examPlanId]
        );
        const exams = examsResult.rows;
        if (exams.length === 0) return { error: 'No exams found in this plan' };

        // 2. Get classrooms with bench config
        const classroomsResult = await db.query(
            `SELECT * FROM classrooms WHERE id = ANY($1) AND is_active = true ORDER BY capacity DESC`,
            [classroomIds]
        );
        const classrooms = classroomsResult.rows;
        if (classrooms.length === 0) return { error: 'No valid classrooms selected' };

        // 3. Get all students for the sections involved
        const sectionIds = [...new Set(exams.map((e: any) => e.section_id))];
        const studentsResult = await db.query(
            `SELECT sp.id, sp.enrollment_number, sp.section_id, sp.program_id,
                    u.name as student_name, sec.name as section_name, p.name as program_name
             FROM student_profiles sp
             JOIN users u ON sp.user_id = u.id
             JOIN sections sec ON sp.section_id = sec.id
             LEFT JOIN programs p ON sp.program_id = p.id
             WHERE sp.section_id = ANY($1)
             ORDER BY sp.enrollment_number`,
            [sectionIds]
        );
        const allStudents = studentsResult.rows;

        // 4. Group exams by date+slot
        const slotGroups = new Map<string, any[]>();
        for (const exam of exams) {
            const key = `${exam.exam_date}_${exam.slot_start}_${exam.slot_end}`;
            if (!slotGroups.has(key)) slotGroups.set(key, []);
            slotGroups.get(key)!.push(exam);
        }

        const results: any[] = [];

        // 5. For each slot group, generate seating across classrooms
        for (const [slotKey, slotExams] of slotGroups) {
            // Get students for sections in this slot
            const slotSectionIds = new Set(slotExams.map((e: any) => e.section_id));
            const slotStudents = allStudents.filter((s: any) => slotSectionIds.has(s.section_id));

            if (slotStudents.length === 0) continue;

            // Group students by section (branch pools)
            const pools = new Map<string, any[]>();
            for (const student of slotStudents) {
                if (!pools.has(student.section_id)) pools.set(student.section_id, []);
                pools.get(student.section_id)!.push(student);
            }

            // Shuffle each pool for randomness
            for (const pool of pools.values()) {
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
            }

            // Create round-robin iterator across pools
            const poolKeys = [...pools.keys()];
            const poolPointers = new Map<string, number>();
            for (const key of poolKeys) poolPointers.set(key, 0);

            let currentPoolIdx = 0;
            let totalAssigned = 0;
            const totalStudents = slotStudents.length;

            function getNextStudent(excludeSectionId?: string): any | null {
                const startIdx = currentPoolIdx;
                let tried = 0;
                while (tried < poolKeys.length) {
                    const poolKey = poolKeys[(startIdx + tried) % poolKeys.length];
                    const pointer = poolPointers.get(poolKey)!;
                    const pool = pools.get(poolKey)!;

                    if (pointer < pool.length && (!excludeSectionId || poolKey !== excludeSectionId)) {
                        poolPointers.set(poolKey, pointer + 1);
                        currentPoolIdx = ((startIdx + tried) % poolKeys.length + 1) % poolKeys.length;
                        totalAssigned++;
                        return pool[pointer];
                    }
                    tried++;
                }
                // If constraint can't be met, just get any available student
                for (const poolKey of poolKeys) {
                    const pointer = poolPointers.get(poolKey)!;
                    const pool = pools.get(poolKey)!;
                    if (pointer < pool.length) {
                        poolPointers.set(poolKey, pointer + 1);
                        totalAssigned++;
                        return pool[pointer];
                    }
                }
                return null;
            }

            // Assign across classrooms
            for (const classroom of classrooms) {
                if (totalAssigned >= totalStudents) break;

                const assignments: SeatAssignment[] = [];
                const rows = classroom.bench_rows || 5;
                const cols = classroom.bench_columns || 6;
                const seatsPerBench = classroom.seats_per_bench || 2;
                const totalBenches = classroom.total_benches || (rows * cols);

                let lastSectionOnBench: string | null = null;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const benchNum = r * cols + c;
                        if (benchNum >= totalBenches) break;
                        if (totalAssigned >= totalStudents) break;

                        lastSectionOnBench = null;

                        for (let s = 0; s < seatsPerBench; s++) {
                            if (totalAssigned >= totalStudents) break;

                            const student = getNextStudent(lastSectionOnBench || undefined);
                            if (!student) break;

                            assignments.push({
                                bench_row: r,
                                bench_col: c,
                                seat: s,
                                student_id: student.id,
                                enrollment_no: student.enrollment_number || '',
                                student_name: student.student_name || '',
                                section_id: student.section_id,
                                section_name: student.section_name || '',
                                program_name: student.program_name || ''
                            });
                            lastSectionOnBench = student.section_id;
                        }
                    }
                }

                if (assignments.length > 0) {
                    // Validate constraints
                    let violations = 0;
                    for (let i = 0; i < assignments.length; i++) {
                        const a = assignments[i];
                        // Check same-bench neighbor
                        const neighbor = assignments.find(b =>
                            b.bench_row === a.bench_row && b.bench_col === a.bench_col && b.seat !== a.seat
                        );
                        if (neighbor && neighbor.section_id === a.section_id) violations++;
                    }

                    const seatingData = {
                        assignments,
                        constraints_satisfied: violations === 0,
                        violations,
                        total_seated: assignments.length,
                        generation_strategy: 'interleave_branches',
                        generated_at: new Date().toISOString()
                    };

                    // Store for each exam in this slot
                    for (const exam of slotExams) {
                        await this.createSeatingPlan(exam.id, classroom.id, seatingData, generatedBy);
                    }

                    results.push({
                        classroom_id: classroom.id,
                        classroom_name: classroom.name,
                        seated: assignments.length,
                        capacity: classroom.capacity,
                        violations,
                        slot: slotKey
                    });
                }
            }
        }

        return {
            success: true,
            results,
            total_students: allStudents.length,
            total_seated: results.reduce((sum: number, r: any) => sum + r.seated, 0)
        };
    }

    static async swapStudents(seatingPlanId: string, seat1: { row: number, col: number, seat: number }, seat2: { row: number, col: number, seat: number }) {
        const result = await db.query(`SELECT * FROM exam_seating_plans WHERE id = $1`, [seatingPlanId]);
        if (!result.rows[0]) return null;

        const plan = result.rows[0];
        const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;

        const a1 = data.assignments.find((a: any) => a.bench_row === seat1.row && a.bench_col === seat1.col && a.seat === seat1.seat);
        const a2 = data.assignments.find((a: any) => a.bench_row === seat2.row && a.bench_col === seat2.col && a.seat === seat2.seat);

        if (a1 && a2) {
            // Swap all student fields
            const fields = ['student_id', 'enrollment_no', 'student_name', 'section_id', 'section_name', 'program_name'];
            for (const f of fields) {
                const temp = a1[f];
                a1[f] = a2[f];
                a2[f] = temp;
            }
        }

        await db.query(
            `UPDATE exam_seating_plans SET seating_data_json = $1, seating_version = seating_version + 1 WHERE id = $2`,
            [JSON.stringify(data), seatingPlanId]
        );
        return data;
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

    static async removeInvigilator(assignmentId: string) {
        await db.query(`DELETE FROM invigilation_assignments WHERE id = $1`, [assignmentId]);
    }

    static async getInvigilationAssignments(examPlanId: string) {
        const result = await db.query(
            `SELECT ia.*, e.exam_date, e.slot_start, e.slot_end, e.classroom_id,
                    u.name as faculty_name, c.name as classroom_name,
                    s.name as subject_name, s.code as subject_code
             FROM invigilation_assignments ia
             JOIN exams e ON ia.exam_id = e.id
             JOIN faculty_profiles fp ON ia.faculty_profile_id = fp.id
             JOIN users u ON fp.user_id = u.id
             LEFT JOIN classrooms c ON e.classroom_id = c.id
             LEFT JOIN subjects s ON e.subject_id = s.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start, c.name`,
            [examPlanId]
        );
        return result.rows;
    }

    static async autoAssignInvigilators(examPlanId: string, universityId: string, assignedBy: string) {
        // Get all exams with classroom requirements
        const examsResult = await db.query(
            `SELECT e.*, c.invigilators_required, c.name as classroom_name
             FROM exams e
             JOIN classrooms c ON e.classroom_id = c.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start`,
            [examPlanId]
        );

        // Get available faculty
        const facultyResult = await db.query(
            `SELECT fp.id, fp.user_id, u.name as faculty_name
             FROM faculty_profiles fp
             JOIN users u ON fp.user_id = u.id
             WHERE fp.university_id = $1 AND fp.is_active = true
             ORDER BY u.name`,
            [universityId]
        );
        const faculty = facultyResult.rows;
        if (faculty.length === 0) return { error: 'No faculty available' };

        // Clear existing assignments for this plan
        await db.query(
            `DELETE FROM invigilation_assignments WHERE exam_id IN (SELECT id FROM exams WHERE exam_plan_id = $1)`,
            [examPlanId]
        );

        const assignments: any[] = [];
        let facultyIdx = 0;

        // Group exams by date+slot
        const slotGroups = new Map<string, any[]>();
        for (const exam of examsResult.rows) {
            const key = `${exam.exam_date}_${exam.slot_start}`;
            if (!slotGroups.has(key)) slotGroups.set(key, []);
            slotGroups.get(key)!.push(exam);
        }

        for (const [, slotExams] of slotGroups) {
            const assignedInSlot = new Set<string>();

            for (const exam of slotExams) {
                const required = exam.invigilators_required || 1;
                for (let i = 0; i < required; i++) {
                    // Find next available faculty not already assigned in this slot
                    let tries = 0;
                    while (tries < faculty.length) {
                        const f = faculty[facultyIdx % faculty.length];
                        facultyIdx++;
                        if (!assignedInSlot.has(f.id)) {
                            assignedInSlot.add(f.id);
                            const assignment = await this.assignInvigilator(exam.id, f.id, assignedBy);
                            assignments.push({ ...assignment, faculty_name: f.faculty_name });
                            break;
                        }
                        tries++;
                    }
                }
            }
        }

        return { success: true, assignments_count: assignments.length };
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
        await db.query(
            `INSERT INTO result_publication_logs (exam_plan_id, publication_status, published_at)
             SELECT exam_plan_id, 'PUBLISHED', NOW() FROM exams WHERE id = $1 LIMIT 1`,
            [examId]
        );
    }

    // --- Retrieval ---

    static async getExamSchedule(planId: string) {
        const result = await db.query(
            `SELECT e.*, s.name as subject_name, s.code as subject_code,
                    cl.name as classroom_name, sec.name as section_name
             FROM exams e
             JOIN subjects s ON e.subject_id = s.id
             LEFT JOIN classrooms cl ON e.classroom_id = cl.id
             JOIN sections sec ON e.section_id = sec.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start`,
            [planId]
        );
        return result.rows;
    }

    static async getExamPlanStats(planId: string) {
        const result = await db.query(
            `SELECT
                COUNT(DISTINCT e.id) as total_exams,
                COUNT(DISTINCT e.subject_id) as total_subjects,
                COUNT(DISTINCT e.section_id) as total_sections,
                COUNT(DISTINCT e.classroom_id) FILTER (WHERE e.classroom_id IS NOT NULL) as classrooms_assigned,
                COUNT(DISTINCT ia.id) as invigilators_assigned,
                COUNT(DISTINCT esp.id) as seating_plans_generated
             FROM exams e
             LEFT JOIN invigilation_assignments ia ON ia.exam_id = e.id
             LEFT JOIN exam_seating_plans esp ON esp.exam_id = e.id
             WHERE e.exam_plan_id = $1`,
            [planId]
        );
        return result.rows[0];
    }
}
