import { db } from '../db/client';

export interface ExamPlan {
    id: string;
    university_id: string;
    program_id: string | null;
    term_id: string | null;
    batch_id?: string | null;
    semester_number?: number | null;
    term_ids?: string[];
    covered_programs_json?: any;
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
    program_id?: string;
    program_name: string;
    batch_id?: string;
    batch_name?: string;
}

export class ExamService {
    // --- Exam Planning ---

    static async getExamPlans(universityId: string) {
        const result = await db.query(
            `SELECT ep.*, p.name as program_name, t.name as term_name,
                    ab.name as batch_name,
                    (SELECT COUNT(*) FROM exams e WHERE e.exam_plan_id = ep.id) as exam_count
             FROM exam_plans ep
             LEFT JOIN programs p ON ep.program_id = p.id
             LEFT JOIN terms t ON ep.term_id = t.id
             LEFT JOIN academic_batches ab ON ep.batch_id = ab.id
             WHERE ep.university_id = $1
             ORDER BY ep.created_at DESC`,
            [universityId]
        );
        return result.rows;
    }

    static async getExamPlan(planId: string) {
        const result = await db.query(
            `SELECT ep.*, p.name as program_name, t.name as term_name,
                    ab.name as batch_name
             FROM exam_plans ep
             LEFT JOIN programs p ON ep.program_id = p.id
             LEFT JOIN terms t ON ep.term_id = t.id
             LEFT JOIN academic_batches ab ON ep.batch_id = ab.id
             WHERE ep.id = $1`,
            [planId]
        );
        return result.rows[0] || null;
    }

    static async createExamPlan(data: any) {
        // Support both old-style (program_id + term_id) and new-style (batch_id + semester_number)
        const result = await db.query(
            `INSERT INTO exam_plans (university_id, program_id, term_id, batch_id, semester_number, term_ids, covered_programs_json, exam_name, exam_type, start_date, end_date, version_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRAFT')
             RETURNING *`,
            [
                data.university_id,
                data.program_id || null,
                data.term_id || null,
                data.batch_id || null,
                data.semester_number || null,
                data.term_ids || null,
                data.covered_programs_json ? JSON.stringify(data.covered_programs_json) : null,
                data.exam_name,
                data.exam_type,
                data.start_date,
                data.end_date
            ]
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

            // Sort each pool by enrollment number (roll number order)
            for (const pool of pools.values()) {
                pool.sort((a: any, b: any) => (a.enrollment_number || '').localeCompare(b.enrollment_number || ''));
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
                const defaultSeatsPerBench = classroom.seats_per_bench || 2;
                const totalBenches = classroom.total_benches || (rows * cols);

                // Build per-bench seat count map from bench_types in metadata
                const meta = typeof classroom.metadata_json === 'string' ? JSON.parse(classroom.metadata_json || '{}') : (classroom.metadata_json || {});
                const benchTypes: Array<{count: number; seats_per_bench: number}> = meta.bench_types || [];
                // Create array: seatsForBench[benchNum] = number of seats
                const seatsForBench: number[] = [];
                if (benchTypes.length > 0) {
                    for (const bt of benchTypes) {
                        for (let i = 0; i < (bt.count || 0); i++) {
                            seatsForBench.push(bt.seats_per_bench || defaultSeatsPerBench);
                        }
                    }
                }

                let lastSectionOnBench: string | null = null;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const benchNum = r * cols + c;
                        if (benchNum >= totalBenches) break;
                        if (totalAssigned >= totalStudents) break;

                        // Use per-bench seat count if available, else default
                        const seatsThisBench = seatsForBench[benchNum] || defaultSeatsPerBench;
                        lastSectionOnBench = null;

                        for (let s = 0; s < seatsThisBench; s++) {
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
                    // Validate constraints and repair violations
                    const countViolations = () => {
                        let v = 0;
                        for (let i = 0; i < assignments.length; i++) {
                            const a = assignments[i];
                            const neighbor = assignments.find(b =>
                                b.bench_row === a.bench_row && b.bench_col === a.bench_col && b.seat !== a.seat
                            );
                            if (neighbor && neighbor.section_id === a.section_id) v++;
                        }
                        return v;
                    };

                    let violations = countViolations();

                    // Repair loop: try to fix violations by swapping students across benches
                    const MAX_REPAIR_PASSES = 3;
                    for (let pass = 0; pass < MAX_REPAIR_PASSES && violations > 0; pass++) {
                        for (let i = 0; i < assignments.length; i++) {
                            const a = assignments[i];
                            const benchMate = assignments.find(b =>
                                b.bench_row === a.bench_row && b.bench_col === a.bench_col && b.seat !== a.seat
                            );
                            if (!benchMate || benchMate.section_id !== a.section_id) continue;

                            // a is a violating student — find a swap candidate on a different bench
                            let swapped = false;
                            for (let j = 0; j < assignments.length && !swapped; j++) {
                                const candidate = assignments[j];
                                // Must be on a different bench
                                if (candidate.bench_row === a.bench_row && candidate.bench_col === a.bench_col) continue;

                                // Check that putting 'a' on the candidate's bench won't create a new violation
                                const candidateBenchMate = assignments.find(b =>
                                    b.bench_row === candidate.bench_row && b.bench_col === candidate.bench_col && b.seat !== candidate.seat
                                );

                                // a's section must differ from candidate's bench-mate's section (if bench-mate exists)
                                if (candidateBenchMate && candidateBenchMate.section_id === a.section_id) continue;

                                // candidate's section must differ from a's bench-mate's section
                                if (benchMate.section_id === candidate.section_id) continue;

                                // Perform the swap — exchange student fields between a and candidate
                                const tempStudentId = a.student_id;
                                const tempEnrollment = a.enrollment_no;
                                const tempName = a.student_name;
                                const tempSection = a.section_id;
                                const tempSectionName = a.section_name;
                                const tempProgram = a.program_name;

                                a.student_id = candidate.student_id;
                                a.enrollment_no = candidate.enrollment_no;
                                a.student_name = candidate.student_name;
                                a.section_id = candidate.section_id;
                                a.section_name = candidate.section_name;
                                a.program_name = candidate.program_name;

                                candidate.student_id = tempStudentId;
                                candidate.enrollment_no = tempEnrollment;
                                candidate.student_name = tempName;
                                candidate.section_id = tempSection;
                                candidate.section_name = tempSectionName;
                                candidate.program_name = tempProgram;

                                swapped = true;
                            }
                        }
                        violations = countViolations();
                    }

                    const seatingData = {
                        assignments,
                        constraints_satisfied: violations === 0,
                        violations,
                        total_seated: assignments.length,
                        generation_strategy: 'interleave_branches',
                        generated_at: new Date().toISOString(),
                        bench_types: benchTypes.length > 0 ? benchTypes : undefined,
                        seats_for_bench: seatsForBench.length > 0 ? seatsForBench : undefined
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

    static async assignInvigilator(examId: string, facultyProfileId: string, assignedBy: string, classroomId?: string) {
        const result = await db.query(
            `INSERT INTO invigilation_assignments (exam_id, faculty_profile_id, assigned_by, classroom_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [examId, facultyProfileId, assignedBy, classroomId || null]
        );
        return result.rows[0];
    }

    static async removeInvigilator(assignmentId: string) {
        await db.query(`DELETE FROM invigilation_assignments WHERE id = $1`, [assignmentId]);
    }

    static async getInvigilationAssignments(examPlanId: string) {
        const result = await db.query(
            `SELECT ia.id, ia.exam_id, ia.faculty_profile_id, ia.assignment_status, ia.classroom_id,
                    e.exam_date, e.slot_start, e.slot_end,
                    u.name as faculty_name,
                    c.name as classroom_name,
                    -- Get ALL subjects for the same slot + classroom (case-insensitive dedup)
                    (SELECT string_agg(sub_name, ', ' ORDER BY sub_name)
                     FROM (SELECT DISTINCT ON (LOWER(sub.name)) sub.name as sub_name
                           FROM exams e2
                           JOIN exam_seating_plans esp2 ON esp2.exam_id = e2.id
                           JOIN subjects sub ON e2.subject_id = sub.id
                           WHERE e2.exam_plan_id = $1
                             AND e2.exam_date = e.exam_date
                             AND e2.slot_start = e.slot_start
                             AND esp2.classroom_id = ia.classroom_id
                           ORDER BY LOWER(sub.name), sub.name) sq
                    ) as all_subjects,
                    (SELECT string_agg(sub_code, ', ' ORDER BY sub_code)
                     FROM (SELECT DISTINCT ON (LOWER(sub.code)) sub.code as sub_code
                           FROM exams e2
                           JOIN exam_seating_plans esp2 ON esp2.exam_id = e2.id
                           JOIN subjects sub ON e2.subject_id = sub.id
                           WHERE e2.exam_plan_id = $1
                             AND e2.exam_date = e.exam_date
                             AND e2.slot_start = e.slot_start
                             AND esp2.classroom_id = ia.classroom_id
                           ORDER BY LOWER(sub.code), sub.code) sq2
                    ) as all_subject_codes
             FROM invigilation_assignments ia
             JOIN exams e ON ia.exam_id = e.id
             JOIN faculty_profiles fp ON ia.faculty_profile_id = fp.id
             JOIN users u ON fp.user_id = u.id
             LEFT JOIN classrooms c ON ia.classroom_id = c.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start, c.name`,
            [examPlanId]
        );
        return result.rows;
    }

    static async autoAssignInvigilators(examPlanId: string, universityId: string, assignedBy: string) {
        // Get exams that have seating plans generated (only these classrooms need invigilators)
        // Group by (date, slot, classroom) to avoid duplicate assignments
        const examsResult = await db.query(
            `SELECT DISTINCT ON (e.exam_date, e.slot_start, esp.classroom_id)
                    e.id, e.exam_date, e.slot_start, e.slot_end, e.subject_id,
                    esp.classroom_id, c.invigilators_required, c.name as classroom_name
             FROM exams e
             JOIN exam_seating_plans esp ON esp.exam_id = e.id
             JOIN classrooms c ON esp.classroom_id = c.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start, esp.classroom_id`,
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

        // Group exams by date+slot
        const slotGroups = new Map<string, any[]>();
        for (const exam of examsResult.rows) {
            const key = `${exam.exam_date}_${exam.slot_start}`;
            if (!slotGroups.has(key)) slotGroups.set(key, []);
            slotGroups.get(key)!.push(exam);
        }

        // Build a flat list of "seats needed" per slot: [{examId, classroomId, seatIdx}]
        // Then rotate the faculty list by a different offset each slot
        const sortedSlotKeys = [...slotGroups.keys()].sort();
        const numClassrooms = Math.max(...[...slotGroups.values()].map(s => s.length), 1);
        // Shift by number of seats that guarantees different pairing each slot
        // Use an offset that's coprime with faculty.length for maximum spread
        const shiftPerSlot = numClassrooms > 1 ? Math.ceil(faculty.length / numClassrooms) : 1;

        for (let si = 0; si < sortedSlotKeys.length; si++) {
            const slotExams = slotGroups.get(sortedSlotKeys[si])!;
            const assignedInSlot = new Set<string>();

            // Build ordered seat requests for this slot
            const seatRequests: { exam: any; seatNum: number }[] = [];
            for (const exam of slotExams) {
                const required = exam.invigilators_required || 1;
                for (let i = 0; i < required; i++) {
                    seatRequests.push({ exam, seatNum: i });
                }
            }

            // Rotate faculty starting position each slot
            const baseOffset = (si * shiftPerSlot) % faculty.length;

            for (let ri = 0; ri < seatRequests.length; ri++) {
                const { exam } = seatRequests[ri];
                const fIdx = (baseOffset + ri) % faculty.length;
                const f = faculty[fIdx];

                if (!assignedInSlot.has(f.id)) {
                    assignedInSlot.add(f.id);
                    const assignment = await this.assignInvigilator(exam.id, f.id, assignedBy, exam.classroom_id);
                    assignments.push({ ...assignment, faculty_name: f.faculty_name });
                } else {
                    // Faculty already used in this slot (can happen if faculty < seats), find next available
                    for (let t = 1; t < faculty.length; t++) {
                        const altF = faculty[(fIdx + t) % faculty.length];
                        if (!assignedInSlot.has(altF.id)) {
                            assignedInSlot.add(altF.id);
                            const assignment = await this.assignInvigilator(exam.id, altF.id, assignedBy, exam.classroom_id);
                            assignments.push({ ...assignment, faculty_name: altF.faculty_name });
                            break;
                        }
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
                    cl.name as classroom_name, sec.name as section_name,
                    p.name as program_name, p.id as program_id
             FROM exams e
             JOIN subjects s ON e.subject_id = s.id
             LEFT JOIN classrooms cl ON e.classroom_id = cl.id
             JOIN sections sec ON e.section_id = sec.id
             LEFT JOIN programs p ON sec.program_id = p.id
             WHERE e.exam_plan_id = $1
             ORDER BY e.exam_date, e.slot_start, COALESCE(p.name, sec.name)`,
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

    // --- Auto Timetable Generation (Multi-Branch) ---

    static async autoGenerateTimetable(params: {
        examPlanId: string;
        timeSlots: Array<{ start: string; end: string }>;
        classroomIds: string[];
        excludeDates?: string[];
        maxExamsPerDayPerStudent?: number;
    }): Promise<{ exams_created: number; conflicts: string[]; warnings: string[] }> {
        const { examPlanId, timeSlots, classroomIds, excludeDates = [], maxExamsPerDayPerStudent = 2 } = params;
        const conflicts: string[] = [];
        const warnings: string[] = [];

        // 1. Get the exam plan
        const planResult = await db.query(
            `SELECT ep.*, ab.name as batch_name
             FROM exam_plans ep
             LEFT JOIN academic_batches ab ON ep.batch_id = ab.id
             WHERE ep.id = $1`,
            [examPlanId]
        );
        const plan = planResult.rows[0];
        if (!plan) throw new Error(`Exam plan not found: ${examPlanId}`);

        // 2. Resolve all programs/terms/sections/subjects for this plan
        // New-style: batch_id + semester_number (multi-branch)
        // Old-style fallback: program_id + term_id (single branch)
        let allSubjects: any[] = [];
        let allSections: any[] = [];

        if (plan.batch_id && plan.semester_number) {
            // Multi-branch: find all terms for this semester across all programs
            const termsResult = await db.query(
                `SELECT t.id, t.program_id, p.name as program_name
                 FROM terms t
                 JOIN programs p ON t.program_id = p.id
                 WHERE t.university_id = $1 AND t.semester_number = $2 AND t.is_active = true`,
                [plan.university_id, plan.semester_number]
            );

            for (const term of termsResult.rows) {
                // Get sections for this program + batch
                let secs = await db.query(
                    `SELECT s.id, s.name, s.strength, s.program_id, $3::text as program_name
                     FROM sections s
                     WHERE s.program_id = $1 AND s.batch_id = $2 AND s.is_active = true`,
                    [term.program_id, plan.batch_id, term.program_name]
                );
                if (secs.rows.length === 0) {
                    // Fallback: match by program_id only
                    secs = await db.query(
                        `SELECT s.id, s.name, s.strength, s.program_id, $2::text as program_name
                         FROM sections s
                         WHERE s.program_id = $1 AND s.is_active = true`,
                        [term.program_id, term.program_name]
                    );
                }
                allSections.push(...secs.rows);

                // Get subjects for this program + term
                let subs = await db.query(
                    `SELECT id, name, code, program_id FROM subjects
                     WHERE program_id = $1 AND term_id = $2 AND is_active = true`,
                    [term.program_id, term.id]
                );
                if (subs.rows.length === 0) {
                    subs = await db.query(
                        `SELECT id, name, code, program_id FROM subjects
                         WHERE program_id = $1 AND is_active = true`,
                        [term.program_id]
                    );
                }
                allSubjects.push(...subs.rows);
            }
        } else if (plan.program_id) {
            // Old-style: single program
            let subs = await db.query(
                `SELECT id, name, code, program_id FROM subjects WHERE program_id = $1 AND is_active = true ORDER BY name`,
                [plan.program_id]
            );
            allSubjects = subs.rows;

            let secs = await db.query(
                `SELECT s.id, s.name, s.strength, s.program_id, p.name as program_name
                 FROM sections s JOIN programs p ON s.program_id = p.id
                 WHERE s.program_id = $1 AND s.is_active = true`,
                [plan.program_id]
            );
            allSections = secs.rows;
        }

        if (allSubjects.length === 0) {
            warnings.push('No subjects found for this plan. Check program/term setup.');
            return { exams_created: 0, conflicts, warnings };
        }
        if (allSections.length === 0) {
            warnings.push('No sections found for this plan. Check batch/section setup.');
            return { exams_created: 0, conflicts, warnings };
        }

        // 3. Get classroom details
        const classroomsResult = await db.query(
            `SELECT id, name, capacity FROM classrooms WHERE id = ANY($1) AND is_active = true ORDER BY capacity DESC`,
            [classroomIds]
        );
        const classrooms = classroomsResult.rows;
        if (classrooms.length === 0) {
            warnings.push('No valid active classrooms found');
            return { exams_created: 0, conflicts, warnings };
        }

        // 4. Get student counts per section
        const sectionIds = allSections.map((s: any) => s.id);
        const studentCountsResult = await db.query(
            `SELECT section_id, COUNT(*)::int as student_count FROM student_profiles WHERE section_id = ANY($1) GROUP BY section_id`,
            [sectionIds]
        );
        const studentCountMap = new Map<string, number>();
        for (const row of studentCountsResult.rows) {
            studentCountMap.set(row.section_id, row.student_count);
        }
        for (const sec of allSections) {
            sec.strength = studentCountMap.get(sec.id) || sec.strength || 0;
        }

        // 5. Build exam requirements: one per (subject, section) where subject.program_id matches section.program_id
        interface ExamReq {
            subjectId: string; subjectName: string; subjectCode: string;
            sectionId: string; sectionName: string; programName: string;
            strength: number; programId: string;
        }
        const examReqs: ExamReq[] = [];
        for (const subject of allSubjects) {
            const matchingSections = allSections.filter((s: any) => s.program_id === subject.program_id);
            for (const section of matchingSections) {
                examReqs.push({
                    subjectId: subject.id, subjectName: subject.name, subjectCode: subject.code || '',
                    sectionId: section.id, sectionName: section.name, programName: section.program_name || '',
                    strength: section.strength || 0, programId: subject.program_id,
                });
            }
        }

        warnings.push(`Found ${allSubjects.length} subjects across ${new Set(allSections.map((s: any) => s.program_id)).size} branches, ${allSections.length} sections. Scheduling ${examReqs.length} exams.`);

        // 6. Generate valid dates
        const excludeSet = new Set(excludeDates.map(d => d.substring(0, 10)));
        const validDates: string[] = [];
        const startDate = new Date(plan.start_date);
        const endDate = new Date(plan.end_date);
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().substring(0, 10);
            if (d.getDay() === 0) continue; // Skip Sundays
            if (excludeSet.has(dateStr)) continue;
            validDates.push(dateStr);
        }
        if (validDates.length === 0) {
            warnings.push('No valid dates in range');
            return { exams_created: 0, conflicts, warnings };
        }

        // 7. Delete existing exams
        await db.query(`DELETE FROM exams WHERE exam_plan_id = $1`, [examPlanId]);

        // 8. Save config
        await db.query(
            `UPDATE exam_plans SET time_slots_json = $1, available_classroom_ids = $2, generation_config_json = $3 WHERE id = $4`,
            [JSON.stringify(timeSlots), classroomIds, JSON.stringify({ excludeDates, maxExamsPerDayPerStudent }), examPlanId]
        );

        // 9. University-style scheduling:
        //    - Common subjects (same name across branches) go in the SAME slot
        //    - Different subjects for each branch are staggered across slots
        //    - Respects maxExamsPerDayPerStudent constraint

        // Group subjects by program (branch)
        const branchSubjects = new Map<string, ExamReq[]>();
        for (const req of examReqs) {
            if (!branchSubjects.has(req.programId)) branchSubjects.set(req.programId, []);
            branchSubjects.get(req.programId)!.push(req);
        }
        const branches = [...branchSubjects.keys()];

        // Find common subjects (same name across multiple branches) and unique subjects
        // Group all exam reqs by subject name
        const subjectNameGroups = new Map<string, ExamReq[]>();
        for (const req of examReqs) {
            const key = req.subjectName.toLowerCase().trim();
            if (!subjectNameGroups.has(key)) subjectNameGroups.set(key, []);
            subjectNameGroups.get(key)!.push(req);
        }

        // Separate into: common subjects (shared by 2+ branches) and branch-specific
        const commonSubjects: Array<{ name: string; reqs: ExamReq[] }> = [];
        const branchOnlySubjects = new Map<string, ExamReq[]>(); // programId -> branch-specific reqs

        for (const [name, reqs] of subjectNameGroups) {
            const uniqueBranches = new Set(reqs.map(r => r.programId));
            if (uniqueBranches.size > 1) {
                // Common subject — all branches with this subject get it in the same slot
                commonSubjects.push({ name, reqs });
            } else {
                // Branch-specific subject
                const branchId = reqs[0].programId;
                if (!branchOnlySubjects.has(branchId)) branchOnlySubjects.set(branchId, []);
                branchOnlySubjects.get(branchId)!.push(...reqs);
            }
        }

        // Sort common subjects alphabetically for consistent ordering
        commonSubjects.sort((a, b) => a.name.localeCompare(b.name));

        // Sort branch-specific subjects alphabetically within each branch
        for (const reqs of branchOnlySubjects.values()) {
            reqs.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        }

        // Build time slots list
        const allSlots: Array<{ date: string; slotIdx: number }> = [];
        for (const date of validDates) {
            for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
                allSlots.push({ date, slotIdx });
            }
        }

        // Track per-branch slot assignments to avoid double-booking
        const branchSlotUsed = new Map<string, Set<number>>(); // programId -> set of slot numbers
        for (const b of branches) branchSlotUsed.set(b, new Set());

        // Track per-branch per-day exam count for maxExamsPerDayPerStudent
        const branchDayCount = new Map<string, Map<string, number>>();
        for (const b of branches) branchDayCount.set(b, new Map());

        let examsCreated = 0;

        function canScheduleInSlot(slotNum: number, branchId: string): boolean {
            if (slotNum >= allSlots.length) return false;
            if (branchSlotUsed.get(branchId)!.has(slotNum)) return false;
            const date = allSlots[slotNum].date;
            const dayCount = branchDayCount.get(branchId)!.get(date) || 0;
            return dayCount < maxExamsPerDayPerStudent;
        }

        function markSlot(slotNum: number, branchId: string) {
            branchSlotUsed.get(branchId)!.add(slotNum);
            const date = allSlots[slotNum].date;
            const dc = branchDayCount.get(branchId)!;
            dc.set(date, (dc.get(date) || 0) + 1);
        }

        // Phase 1: Schedule common subjects — all branches get them in the SAME slot
        for (const common of commonSubjects) {
            // Find a slot where ALL branches with this subject are free
            let placed = false;
            for (let s = 0; s < allSlots.length; s++) {
                const allFree = common.reqs.every(r => canScheduleInSlot(s, r.programId));
                if (!allFree) continue;

                const { date, slotIdx } = allSlots[s];
                const slot = timeSlots[slotIdx];
                for (const req of common.reqs) {
                    await db.query(
                        `INSERT INTO exams (exam_plan_id, subject_id, section_id, exam_date, slot_start, slot_end, classroom_id, exam_mode, exam_status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OFFLINE', 'SCHEDULED')`,
                        [examPlanId, req.subjectId, req.sectionId, date, slot.start, slot.end, classrooms[0].id]
                    );
                    markSlot(s, req.programId);
                    examsCreated++;
                }
                placed = true;
                break;
            }
            if (!placed) {
                for (const req of common.reqs) {
                    conflicts.push(`Could not schedule common subject: ${req.subjectName} for ${req.programName}`);
                }
            }
        }

        // Phase 2: Schedule branch-specific subjects — stagger across remaining slots
        // Collect all branch-specific subjects into a round-robin queue
        const branchQueues = new Map<string, ExamReq[]>();
        for (const [branchId, reqs] of branchOnlySubjects) {
            branchQueues.set(branchId, [...reqs]);
        }

        // Round-robin: cycle through branches, pick next unscheduled subject, find next free slot
        let anyPlaced = true;
        while (anyPlaced) {
            anyPlaced = false;
            for (const branchId of branches) {
                const queue = branchQueues.get(branchId);
                if (!queue || queue.length === 0) continue;

                const req = queue[0];
                let placed = false;
                for (let s = 0; s < allSlots.length; s++) {
                    if (!canScheduleInSlot(s, branchId)) continue;

                    const { date, slotIdx } = allSlots[s];
                    const slot = timeSlots[slotIdx];
                    await db.query(
                        `INSERT INTO exams (exam_plan_id, subject_id, section_id, exam_date, slot_start, slot_end, classroom_id, exam_mode, exam_status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OFFLINE', 'SCHEDULED')`,
                        [examPlanId, req.subjectId, req.sectionId, date, slot.start, slot.end, classrooms[0].id]
                    );
                    markSlot(s, branchId);
                    examsCreated++;
                    queue.shift();
                    placed = true;
                    anyPlaced = true;
                    break;
                }
                if (!placed) {
                    conflicts.push(`Could not schedule: ${req.subjectCode || req.subjectName} for ${req.programName}`);
                    queue.shift();
                    anyPlaced = true; // keep trying others
                }
            }
        }

        // Check for any unplaced exams
        const totalNeeded = examReqs.length;
        if (examsCreated < totalNeeded) {
            conflicts.push(`${totalNeeded - examsCreated} exam(s) could not be placed due to insufficient time slots.`);
            warnings.push(`${conflicts.length} exam(s) could not be placed.`);
        }

        return { exams_created: examsCreated, conflicts, warnings };
    }
}
