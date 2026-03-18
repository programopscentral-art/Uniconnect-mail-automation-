import { db } from '../db/client';

export interface ClassroomInput {
    university_id: string;
    campus_id?: string;
    name: string;
    code: string;
    room_type?: string; // LECTURE, LAB, HALL
    capacity: number;
    floor?: number;
    building?: string;
    total_benches: number;
    seats_per_bench: number;
    bench_rows: number;
    bench_columns: number;
    layout_type?: string; // grid, theater, lab
    invigilators_required?: number;
    metadata_json?: any;
}

export interface BulkClassroomRow {
    university_name: string;
    classrooms_count: number;
    benches_per_classroom: string; // can be "24 (small) / 48 (large)" etc
    students_per_bench: number;
    max_capacity_per_classroom: string;
    total_capacity: number;
    invigilators_per_classroom: string;
    total_invigilators: number;
    remarks?: string;
}

export class ClassroomService {
    static async ensureColumns() {
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS building TEXT`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS total_benches INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS seats_per_bench INTEGER DEFAULT 2`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS invigilators_required INTEGER DEFAULT 1`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_rows INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_columns INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS layout_type TEXT DEFAULT 'grid'`);
    }

    private static columnsEnsured = false;

    private static async ensureColumnsOnce() {
        if (this.columnsEnsured) return;
        await this.ensureColumns();
        this.columnsEnsured = true;
    }

    static async getClassrooms(universityId: string) {
        await this.ensureColumnsOnce();
        const result = await db.query(
            `SELECT id, university_id, campus_id, name, code, room_type, capacity, floor, building,
                    total_benches, seats_per_bench, bench_rows, bench_columns, layout_type,
                    invigilators_required, status, metadata_json, created_at
             FROM classrooms
             WHERE university_id = $1 AND is_active = true
             ORDER BY building NULLS LAST, floor NULLS LAST, name`,
            [universityId]
        );
        return result.rows;
    }

    static async getClassroom(id: string) {
        await this.ensureColumnsOnce();
        const result = await db.query(
            `SELECT * FROM classrooms WHERE id = $1 AND is_active = true`,
            [id]
        );
        return result.rows[0] || null;
    }

    static async batchCreateClassrooms(classrooms: ClassroomInput[]): Promise<any[]> {
        await this.ensureColumnsOnce();
        if (classrooms.length === 0) return [];

        // Auto-calculate bench grid and capacity for each
        for (const data of classrooms) {
            if (!data.bench_rows && !data.bench_columns && data.total_benches > 0) {
                data.bench_columns = Math.ceil(Math.sqrt(data.total_benches));
                data.bench_rows = Math.ceil(data.total_benches / data.bench_columns);
            }
            if (!data.capacity && data.total_benches && data.seats_per_bench) {
                data.capacity = data.total_benches * data.seats_per_bench;
            }
        }

        // Build multi-row INSERT
        const values: any[] = [];
        const placeholders: string[] = [];
        let idx = 1;
        for (const data of classrooms) {
            placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14})`);
            values.push(
                data.university_id, data.campus_id || null, data.name, data.code,
                data.room_type || 'LECTURE', data.capacity, data.floor || null, data.building || null,
                data.total_benches, data.seats_per_bench || 2,
                data.bench_rows, data.bench_columns,
                data.layout_type || 'grid', data.invigilators_required || 1,
                JSON.stringify(data.metadata_json || {})
            );
            idx += 15;
        }

        const result = await db.query(
            `INSERT INTO classrooms (university_id, campus_id, name, code, room_type, capacity, floor, building,
                total_benches, seats_per_bench, bench_rows, bench_columns, layout_type, invigilators_required, metadata_json)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (university_id, campus_id, code) DO UPDATE SET
                name = EXCLUDED.name, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor,
                building = EXCLUDED.building, total_benches = EXCLUDED.total_benches,
                seats_per_bench = EXCLUDED.seats_per_bench, bench_rows = EXCLUDED.bench_rows,
                bench_columns = EXCLUDED.bench_columns, layout_type = EXCLUDED.layout_type,
                invigilators_required = EXCLUDED.invigilators_required, metadata_json = EXCLUDED.metadata_json,
                room_type = EXCLUDED.room_type, updated_at = NOW()
             RETURNING *`,
            values
        );
        return result.rows;
    }

    static async createClassroom(data: ClassroomInput) {
        await this.ensureColumnsOnce();
        // Auto-calculate bench grid if not provided
        if (!data.bench_rows && !data.bench_columns && data.total_benches > 0) {
            data.bench_columns = Math.ceil(Math.sqrt(data.total_benches));
            data.bench_rows = Math.ceil(data.total_benches / data.bench_columns);
        }
        // Auto-calculate capacity
        if (!data.capacity && data.total_benches && data.seats_per_bench) {
            data.capacity = data.total_benches * data.seats_per_bench;
        }

        const result = await db.query(
            `INSERT INTO classrooms (university_id, campus_id, name, code, room_type, capacity, floor, building,
                total_benches, seats_per_bench, bench_rows, bench_columns, layout_type, invigilators_required, metadata_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (university_id, campus_id, code) DO UPDATE SET
                name = EXCLUDED.name, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor,
                building = EXCLUDED.building, total_benches = EXCLUDED.total_benches,
                seats_per_bench = EXCLUDED.seats_per_bench, bench_rows = EXCLUDED.bench_rows,
                bench_columns = EXCLUDED.bench_columns, layout_type = EXCLUDED.layout_type,
                invigilators_required = EXCLUDED.invigilators_required, metadata_json = EXCLUDED.metadata_json,
                room_type = EXCLUDED.room_type, updated_at = NOW()
             RETURNING *`,
            [
                data.university_id, data.campus_id || null, data.name, data.code,
                data.room_type || 'LECTURE', data.capacity, data.floor || null, data.building || null,
                data.total_benches, data.seats_per_bench || 2,
                data.bench_rows, data.bench_columns,
                data.layout_type || 'grid', data.invigilators_required || 1,
                JSON.stringify(data.metadata_json || {})
            ]
        );
        return result.rows[0];
    }

    static async updateClassroom(id: string, data: Partial<ClassroomInput>) {
        await this.ensureColumnsOnce();
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        const fields: (keyof ClassroomInput)[] = [
            'name', 'code', 'room_type', 'capacity', 'floor', 'building',
            'total_benches', 'seats_per_bench', 'bench_rows', 'bench_columns',
            'layout_type', 'invigilators_required'
        ];
        for (const f of fields) {
            if (data[f] !== undefined) {
                sets.push(`${f} = $${idx}`);
                vals.push(data[f]);
                idx++;
            }
        }
        if (data.metadata_json !== undefined) {
            sets.push(`metadata_json = $${idx}`);
            vals.push(JSON.stringify(data.metadata_json));
            idx++;
        }
        if (sets.length === 0) return this.getClassroom(id);

        sets.push(`updated_at = NOW()`);
        vals.push(id);

        const result = await db.query(
            `UPDATE classrooms SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
            vals
        );
        return result.rows[0];
    }

    static async deleteClassroom(id: string) {
        await db.query(`UPDATE classrooms SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    }

    static async bulkImportClassrooms(universityId: string, rows: BulkClassroomRow[]) {
        await this.ensureColumnsOnce();
        // Get or create a default campus for the university
        let campusResult = await db.query(
            `SELECT id FROM campuses WHERE university_id = $1 LIMIT 1`,
            [universityId]
        );
        let campusId: string;
        if (campusResult.rows.length === 0) {
            const newCampus = await db.query(
                `INSERT INTO campuses (university_id, name, code) VALUES ($1, 'Main Campus', 'MAIN')
                 ON CONFLICT DO NOTHING RETURNING id`,
                [universityId]
            );
            campusId = newCampus.rows[0]?.id;
            if (!campusId) {
                campusResult = await db.query(`SELECT id FROM campuses WHERE university_id = $1 LIMIT 1`, [universityId]);
                campusId = campusResult.rows[0].id;
            }
        } else {
            campusId = campusResult.rows[0].id;
        }

        const created: any[] = [];
        for (const row of rows) {
            const count = row.classrooms_count || 1;
            // Parse benches - could be "24 (small) / 48 (large)" or "35 & 40" or just "60"
            const benchNums = (row.benches_per_classroom || '').match(/\d+/g)?.map(Number) || [30];
            const seatsPerBench = row.students_per_bench || 2;
            // Parse capacity - could be "24 (small) / 48 (large)" or "70 & 80" or "60"
            const capacityNums = (row.max_capacity_per_classroom || '').match(/\d+/g)?.map(Number) || [];
            // Parse invigilators
            const invigNums = (row.invigilators_per_classroom || '').match(/\d+/g)?.map(Number) || [1];

            for (let i = 0; i < count; i++) {
                const benchCount = benchNums.length > 1 ? benchNums[i % benchNums.length] : benchNums[0];
                const capacity = capacityNums.length > 0
                    ? (capacityNums.length > 1 ? capacityNums[i % capacityNums.length] : capacityNums[0])
                    : benchCount * seatsPerBench;
                const invigRequired = invigNums.length > 1 ? invigNums[i % invigNums.length] : invigNums[0];

                const cols = Math.ceil(Math.sqrt(benchCount));
                const bRows = Math.ceil(benchCount / cols);
                const roomType = benchCount >= 40 ? 'HALL' : 'LECTURE';
                const code = `R-${i + 1}`;
                const name = count === 1 ? `Classroom ${i + 1}` : `Classroom ${i + 1} (${roomType === 'HALL' ? 'Large' : 'Standard'})`;

                const room = await this.createClassroom({
                    university_id: universityId,
                    campus_id: campusId,
                    name,
                    code,
                    room_type: roomType,
                    capacity,
                    total_benches: benchCount,
                    seats_per_bench: seatsPerBench,
                    bench_rows: bRows,
                    bench_columns: cols,
                    invigilators_required: invigRequired,
                    layout_type: 'grid'
                });
                created.push(room);
            }
        }
        return created;
    }

    static async getAvailableClassrooms(universityId: string, date: string, slotStart: string, slotEnd: string, minCapacity?: number) {
        await this.ensureColumnsOnce();
        let query = `
            SELECT c.* FROM classrooms c
            WHERE c.university_id = $1 AND c.is_active = true
              AND c.id NOT IN (
                SELECT DISTINCT ts.classroom_id FROM timetable_sessions ts
                WHERE ts.date = $2 AND ts.slot_start < $4 AND ts.slot_end > $3
                  AND ts.session_status NOT IN ('CANCELLED')
                  AND ts.classroom_id IS NOT NULL
              )
              AND c.id NOT IN (
                SELECT DISTINCT e.classroom_id FROM exams e
                WHERE e.exam_date = $2 AND e.slot_start < $4 AND e.slot_end > $3
                  AND e.exam_status NOT IN ('CANCELLED')
                  AND e.classroom_id IS NOT NULL
              )
        `;
        const params: any[] = [universityId, date, slotStart, slotEnd];
        if (minCapacity) {
            query += ` AND c.capacity >= $5`;
            params.push(minCapacity);
        }
        query += ` ORDER BY c.capacity, c.name`;
        const result = await db.query(query, params);
        return result.rows;
    }

    static async detectRoomConflicts(universityId: string) {
        // Find rooms booked for overlapping slots (both timetable sessions and exams)
        const result = await db.query(`
            WITH all_bookings AS (
                SELECT classroom_id, date AS booking_date, slot_start, slot_end, 'SESSION' as booking_type,
                       id as entity_id, subject_id
                FROM timetable_sessions
                WHERE session_status NOT IN ('CANCELLED') AND classroom_id IS NOT NULL
                UNION ALL
                SELECT classroom_id, exam_date AS booking_date, slot_start, slot_end, 'EXAM' as booking_type,
                       id as entity_id, subject_id
                FROM exams
                WHERE exam_status NOT IN ('CANCELLED') AND classroom_id IS NOT NULL
            )
            SELECT a.*, b.booking_type as conflict_type, b.entity_id as conflict_entity_id,
                   c.name as classroom_name, c.capacity,
                   a.booking_date, a.slot_start as a_start, a.slot_end as a_end,
                   b.slot_start as b_start, b.slot_end as b_end
            FROM all_bookings a
            JOIN all_bookings b ON a.classroom_id = b.classroom_id
                AND a.booking_date = b.booking_date
                AND a.entity_id != b.entity_id
                AND a.slot_start < b.slot_end AND a.slot_end > b.slot_start
            JOIN classrooms c ON a.classroom_id = c.id
            WHERE c.university_id = $1
            ORDER BY a.booking_date, a.slot_start
        `, [universityId]);
        return result.rows;
    }

    static async reassignRoom(entityType: 'exam' | 'session', entityId: string, newClassroomId: string) {
        if (entityType === 'exam') {
            await db.query(`UPDATE exams SET classroom_id = $1 WHERE id = $2`, [newClassroomId, entityId]);
        } else {
            await db.query(`UPDATE timetable_sessions SET classroom_id = $1 WHERE id = $2`, [newClassroomId, entityId]);
        }
    }
}
