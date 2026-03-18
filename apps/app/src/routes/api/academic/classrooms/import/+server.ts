import { ClassroomService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import XLSX from 'xlsx';

// Direct batch insert — bypasses service layer for maximum speed
async function directBatchInsert(classrooms: any[]): Promise<any[]> {
    if (classrooms.length === 0) return [];

    // Auto-calculate bench grid
    for (const data of classrooms) {
        if (!data.bench_rows && !data.bench_columns && data.total_benches > 0) {
            data.bench_columns = Math.ceil(Math.sqrt(data.total_benches));
            data.bench_rows = Math.ceil(data.total_benches / data.bench_columns);
        }
        if (!data.capacity && data.total_benches && data.seats_per_bench) {
            data.capacity = data.total_benches * data.seats_per_bench;
        }
    }

    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const data of classrooms) {
        placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14})`);
        values.push(
            data.university_id, data.campus_id || null, data.name, data.code,
            data.room_type || 'LECTURE', data.capacity, data.floor || null, data.building || null,
            data.total_benches, data.seats_per_bench || 2,
            data.bench_rows || 0, data.bench_columns || 0,
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

interface ParsedClassroom {
    university_name: string;
    university_id?: string;
    name: string;
    code: string;
    room_type: string;
    total_benches: number;
    seats_per_bench: number;
    capacity: number;
    invigilators_required: number;
    remarks: string;
}

// Parse a number from text, handling ranges like "38-40" → first number
function parseCount(text: string): number {
    const s = String(text || '').trim();
    // Handle ranges: "38-40" → 38, "5-6" → 5
    const rangeMatch = s.match(/^(\d+)\s*[-–—to]+\s*(\d+)$/i);
    if (rangeMatch) return parseInt(rangeMatch[1]);
    // Just get the first number
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
}

// Extract all numbers from multi-value cells, preserving line structure
function extractNumbers(text: string): number[] {
    return (text.match(/\d+/g) || []).map(Number).filter(n => n > 0);
}

function parseExcelClassrooms(buffer: ArrayBuffer): { classrooms: ParsedClassroom[], debug: any[] } {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    if (rows.length < 2) return { classrooms: [], debug: [] };

    // Detect header row — look for "university" or "name" in first few rows
    let headerRow = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const rowText = rows[i].map((c: any) => String(c).toLowerCase()).join(' ');
        if (rowText.includes('university') || rowText.includes('name of')) {
            headerRow = i;
            break;
        }
    }

    const headers = rows[headerRow].map((h: any) => String(h).toLowerCase().trim());

    // Map columns by header text
    const colMap = {
        university: -1,
        classrooms_count: -1,
        benches: -1,
        students_per_bench: -1,
        max_capacity: -1,
        total_capacity: -1,
        invig_per_class: -1,
        total_invig: -1,
        remarks: -1
    };

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes('name') && h.includes('university') || (i === 0 && h.includes('university'))) colMap.university = i;
        else if (h.includes('how many classroom') || h.includes('allocated')) colMap.classrooms_count = i;
        else if (h.includes('bench') && h.includes('available') || h.includes('bench') && h.includes('each')) colMap.benches = i;
        else if (h.includes('student') && h.includes('seated') || h.includes('student') && h.includes('bench')) colMap.students_per_bench = i;
        else if (h.includes('maximum') && h.includes('accommodate') || h.includes('max')) colMap.max_capacity = i;
        else if (h.includes('total') && h.includes('number') && h.includes('student') || h.includes('total') && h.includes('accommodat')) colMap.total_capacity = i;
        else if (h.includes('invig') && h.includes('each') || h.includes('invig') && h.includes('assign') && !h.includes('total')) colMap.invig_per_class = i;
        else if (h.includes('total') && h.includes('invig') || h.includes('total') && h.includes('instructor')) colMap.total_invig = i;
        else if (h.includes('remark')) colMap.remarks = i;
    }

    // Fallback positional: A=uni, B=count, C=benches, D=students, E=maxcap, F=totalcap, G=invig
    if (colMap.university === -1) colMap.university = 0;
    if (colMap.classrooms_count === -1) colMap.classrooms_count = 1;
    if (colMap.benches === -1) colMap.benches = 2;
    if (colMap.students_per_bench === -1) colMap.students_per_bench = 3;
    if (colMap.max_capacity === -1) colMap.max_capacity = 4;
    if (colMap.total_capacity === -1) colMap.total_capacity = 5;
    if (colMap.invig_per_class === -1) colMap.invig_per_class = 6;

    const parsed: ParsedClassroom[] = [];
    const debug: any[] = [];

    for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        const uniName = String(row[colMap.university] || '').trim();
        if (!uniName) continue;

        const classroomCount = parseCount(row[colMap.classrooms_count]) || 1;
        const benchesCell = String(row[colMap.benches] || '');
        const studentsPerBenchCell = String(row[colMap.students_per_bench] || '2');
        const maxCapCell = String(row[colMap.max_capacity] || '');
        const invigCell = String(row[colMap.invig_per_class] || '1');
        const remarksCell = colMap.remarks >= 0 ? String(row[colMap.remarks] || '') : '';

        // Parse seats per bench — handle multi-line: "3 in a big one\n2 in small one"
        // Extract all seat counts for different classroom types
        const seatLines = studentsPerBenchCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const seatNums = seatLines.map(l => {
            const m = l.match(/(\d+)/);
            return m ? parseInt(m[1]) : 2;
        });
        const defaultSeatsPerBench = seatNums[0] || 2;

        // Parse benches cell — the most complex column
        // Formats seen in the sheet:
        // 1. "24 ( small class room )\n48 ( large class room )" — types with counts
        // 2. "21 big\n2 small" — named types with counts
        // 3. "35 & 40" — two bench sizes
        // 4. "60" — single number
        // 5. "80 seats" — seat count, not bench count
        // 6. "Hall 1  32\nHall 2  32\n..." — named halls with bench counts
        // 7. "Section 1: 40\nSection 3:28\n..." — named sections
        // 8. "32(sec-3),28(sec-2),28(sec-1)" — comma-separated with names
        // 9. "minimum 24 benches" — text with number
        // 10. "90 seats each class room" — seats per classroom

        const benchLines = benchesCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);

        interface ClassroomSpec {
            name: string;
            benches: number;
            seatsPerBench: number;
            capacity: number;
            invigilators: number;
        }

        const specs: ClassroomSpec[] = [];

        // Pattern: "Hall 1  32" or "Section 1: 40" — named individual rooms
        const hallPattern = /^(hall|section|room|block)\s*[-.]?\s*(\d+)\s*[:\s]+(\d+)/i;
        // Pattern: "number(name)" like "32(sec-3)" or "24 ( small class room )"
        const parenPattern = /(\d+)\s*\(\s*([^)]+)\s*\)/g;
        // Pattern: "number label" like "21 big" or "48 (large class room)"
        const numLabelPattern = /^(\d+)\s+(.+)$/;
        // Pattern: "label number" like "5.0 lab:5"
        const labelNumPattern = /^(.+?)\s*[:\s]\s*(\d+)\s*$/;

        const hasHallNames = benchLines.some(l => hallPattern.test(l));
        const parenMatches = [...benchesCell.matchAll(parenPattern)];
        const hasParenFormat = parenMatches.length >= 1;

        if (hasHallNames) {
            // CDU-style: "Hall 1  32\nHall 2  32\n..." — each line is one room
            for (const line of benchLines) {
                const m = line.match(hallPattern);
                if (m) {
                    const benchCount = parseInt(m[3]) || 30;
                    specs.push({
                        name: `${m[1]} ${m[2]}`,
                        benches: benchCount,
                        seatsPerBench: defaultSeatsPerBench,
                        capacity: benchCount * defaultSeatsPerBench,
                        invigilators: 1
                    });
                }
            }
            // Also check for non-hall lines like "5.0 lab:5"
            for (const line of benchLines) {
                if (hallPattern.test(line)) continue;
                const m = line.match(labelNumPattern);
                if (m) {
                    const benchCount = parseInt(m[2]) || 0;
                    if (benchCount > 0) {
                        specs.push({
                            name: m[1].trim(),
                            benches: benchCount,
                            seatsPerBench: defaultSeatsPerBench,
                            capacity: benchCount * defaultSeatsPerBench,
                            invigilators: 1
                        });
                    }
                }
            }
        } else if (hasParenFormat && parenMatches.length >= 2) {
            // NRI-style: "32(sec-3),28(sec-2),28(sec-1)" — each match is one room
            // Also Annamacharya-style: "24 ( small class room )\n48 ( large class room )" — types of rooms
            for (const m of parenMatches) {
                const benchCount = parseInt(m[1]);
                const label = m[2].trim();
                specs.push({
                    name: label,
                    benches: benchCount,
                    seatsPerBench: defaultSeatsPerBench,
                    capacity: benchCount * defaultSeatsPerBench,
                    invigilators: 1
                });
            }
            // If we have fewer specs than classroomCount, distribute
            // e.g., Annamacharya: 2 types (small=24, large=48) but 4 classrooms
            if (specs.length < classroomCount && specs.length > 0) {
                const typeSpecs = [...specs];
                specs.length = 0;
                // Distribute classrooms across types evenly
                const perType = Math.ceil(classroomCount / typeSpecs.length);
                let idx = 0;
                for (let t = 0; t < typeSpecs.length; t++) {
                    const count = Math.min(perType, classroomCount - idx);
                    for (let j = 0; j < count; j++) {
                        specs.push({
                            ...typeSpecs[t],
                            name: `${typeSpecs[t].name} ${j + 1}`
                        });
                        idx++;
                    }
                }
            }
        } else if (hasParenFormat && parenMatches.length === 1) {
            // Single paren like "35(Large Class Rooms)\n30(Small Class Rooms)" — Chalapathi
            // Actually this would be caught by >= 2 case above via multi-line
            // But handle single-match case: just one type
            const m = parenMatches[0];
            const benchCount = parseInt(m[1]);
            for (let i = 0; i < classroomCount; i++) {
                specs.push({
                    name: `Classroom ${i + 1}`,
                    benches: benchCount,
                    seatsPerBench: defaultSeatsPerBench,
                    capacity: benchCount * defaultSeatsPerBench,
                    invigilators: 1
                });
            }
        } else {
            // Generic path: "35 & 40", "60", "80 seats", "minimum 24 benches"
            const isSeatCount = /seats?/i.test(benchesCell);
            const benchNums = extractNumbers(benchesCell);
            const invigNums = extractNumbers(invigCell);

            if (benchNums.length === 0) benchNums.push(30);

            // If multi-line with labels like "21 big\n2 small" — MRV
            const hasLabels = benchLines.length >= 2 && benchLines.every(l => {
                const parts = l.match(/^(\d+)\s+(.+)/);
                return parts !== null;
            });

            if (hasLabels) {
                // MRV-style: "21 big\n2 small" — each line is a type
                // With seatLines: "3 in a big one\n2 in small one"
                const typeSpecs: { benches: number; label: string; seats: number }[] = [];
                for (let li = 0; li < benchLines.length; li++) {
                    const m = benchLines[li].match(/^(\d+)\s+(.+)/);
                    if (m) {
                        typeSpecs.push({
                            benches: parseInt(m[1]),
                            label: m[2].trim(),
                            seats: seatNums[li] || defaultSeatsPerBench
                        });
                    }
                }
                // Distribute classroomCount across types
                const perType = Math.ceil(classroomCount / typeSpecs.length);
                let idx = 0;
                for (const ts of typeSpecs) {
                    const count = Math.min(perType, classroomCount - idx);
                    for (let j = 0; j < count; j++) {
                        let benchCount = ts.benches;
                        if (isSeatCount) benchCount = Math.ceil(benchCount / ts.seats);
                        specs.push({
                            name: `Classroom ${idx + 1} (${ts.label})`,
                            benches: benchCount,
                            seatsPerBench: ts.seats,
                            capacity: benchCount * ts.seats,
                            invigilators: invigNums[idx % invigNums.length] || 1
                        });
                        idx++;
                    }
                }
            } else {
                // Simple: "35 & 40", "60", "80 seats", "minimum 24 benches"
                for (let i = 0; i < classroomCount; i++) {
                    let benchCount = benchNums[i % benchNums.length] || benchNums[0] || 30;
                    const spb = defaultSeatsPerBench;
                    if (isSeatCount) benchCount = Math.ceil(benchCount / spb);

                    const label = benchNums.length > 1
                        ? (benchNums[i % benchNums.length] >= Math.max(...benchNums) * 0.8 ? 'Large' : 'Standard')
                        : '';

                    specs.push({
                        name: classroomCount === 1
                            ? 'Classroom 1'
                            : `Classroom ${i + 1}${label ? ` (${label})` : ''}`,
                        benches: benchCount,
                        seatsPerBench: spb,
                        capacity: benchCount * spb,
                        invigilators: invigNums[i % invigNums.length] || 1
                    });
                }
            }
        }

        // Override capacity from max_capacity column if provided (per-classroom values)
        const capLines = maxCapCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        // Check if capacity column has named entries like "Section 1: 120\nSection 2: 75"
        const capHasNames = capLines.some(l => /^(hall|section|room|block)\s*\d/i.test(l) || /^\d+\s*\(/i.test(l));

        let capNums: number[] = [];
        if (capHasNames) {
            // Extract numbers maintaining order: "86(sec-3),77(sec-2),77(sec-1)" → [86,77,77]
            // or "Section 1: 120\nSection 2: 75" → [120,75]
            for (const line of capLines) {
                const nums = extractNumbers(line);
                // For lines like "Section 1: 120", take the LAST number (120, not 1)
                if (nums.length > 0) capNums.push(nums[nums.length - 1]);
            }
        } else {
            capNums = extractNumbers(maxCapCell);
        }

        const invigNums = extractNumbers(invigCell);

        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            // Override capacity if we have per-classroom values
            if (capNums.length > 0) {
                if (capNums.length >= specs.length) {
                    spec.capacity = capNums[i];
                } else if (capNums.length === 1) {
                    spec.capacity = capNums[0];
                } else {
                    spec.capacity = capNums[i % capNums.length];
                }
            }
            // Override invigilators if provided
            if (invigNums.length > 0) {
                if (invigNums.length >= specs.length) {
                    spec.invigilators = invigNums[i];
                } else {
                    spec.invigilators = invigNums[i % invigNums.length] || 1;
                }
            }

            parsed.push({
                university_name: uniName,
                name: `${uniName} - ${spec.name}`,
                code: `${uniName.substring(0, 4).toUpperCase().replace(/\s+/g, '')}-R${r}-${i + 1}`,
                room_type: spec.benches >= 40 ? 'HALL' : spec.benches <= 5 ? 'LAB' : 'LECTURE',
                total_benches: spec.benches,
                seats_per_bench: spec.seatsPerBench,
                capacity: spec.capacity || spec.benches * spec.seatsPerBench,
                invigilators_required: spec.invigilators,
                remarks: remarksCell
            });
        }

        debug.push({
            row: r + 1,
            university: uniName,
            classrooms_parsed: specs.length,
            specs: specs.map(s => ({ name: s.name, benches: s.benches, seats: s.seatsPerBench, cap: s.capacity })),
            raw: { benchesCell, studentsPerBenchCell, maxCapCell, invigCell, classroomCount }
        });
    }

    return { classrooms: parsed, debug };
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const contentType = request.headers.get('content-type') || '';

    // Handle Excel file upload
    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const targetUniversityId = formData.get('universityId') as string;

        if (!file) throw error(400, 'No file uploaded');

        const buffer = await file.arrayBuffer();
        const { classrooms: parsed, debug } = parseExcelClassrooms(buffer);

        if (parsed.length === 0) {
            return json({
                error: 'No classrooms found in the file',
                debug,
                hint: 'Make sure the sheet has columns: University Name, Classrooms Count, Benches per Classroom, Students per Bench, Max Capacity, Total Capacity, Invigilators'
            }, { status: 400 });
        }

        // Match university names to DB records + pre-fetch all campuses + ensure schema (parallel)
        const [uniResult, campusResult] = await Promise.all([
            db.query(`SELECT id, name FROM universities`),
            db.query(`SELECT id, university_id FROM campuses`),
            // Ensure unique constraint exists for ON CONFLICT upsert
            db.query(`
                DO $$ BEGIN
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS campus_id UUID;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS code TEXT;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS room_type TEXT;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS total_benches INTEGER DEFAULT 0;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS seats_per_bench INTEGER DEFAULT 2;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_rows INTEGER DEFAULT 0;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bench_columns INTEGER DEFAULT 0;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS layout_type TEXT DEFAULT 'grid';
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS invigilators_required INTEGER DEFAULT 1;
                    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS building TEXT;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classrooms_university_id_campus_id_code_key') THEN
                        UPDATE classrooms SET code = UPPER(REPLACE(LEFT(name, 20), ' ', '-')) WHERE code IS NULL;
                        ALTER TABLE classrooms ALTER COLUMN code SET NOT NULL;
                        ALTER TABLE classrooms ADD CONSTRAINT classrooms_university_id_campus_id_code_key UNIQUE (university_id, campus_id, code);
                    END IF;
                END $$;
            `)
        ]);

        const uniMap = new Map<string, string>();
        const uniNames: { name: string; id: string }[] = [];
        for (const u of uniResult.rows) {
            const nameUp = u.name.toUpperCase().trim();
            uniMap.set(nameUp, u.id);
            uniNames.push({ name: nameUp, id: u.id });
            // Index individual words (length >= 2 to match short names like "MRV", "NRI", "SGU", "CDU")
            const words = nameUp.split(/\s+/);
            for (const w of words) {
                if (w.length >= 2 && !['OF', 'THE', 'AND', 'FOR', 'IN', 'AT', 'TO', 'BY'].includes(w)) {
                    uniMap.set(w, u.id);
                }
            }
        }

        // Cache campus IDs per university
        const campusMap = new Map<string, string>();
        for (const c of campusResult.rows) {
            if (!campusMap.has(c.university_id)) campusMap.set(c.university_id, c.id);
        }

        const skipped: any[] = [];

        // Step 1: Resolve university IDs for all classrooms
        const resolved: { classroom: ParsedClassroom; uniId: string }[] = [];
        const missingCampusUniIds = new Set<string>();

        // Cache resolved university IDs by sheet name to avoid repeated lookups
        const uniIdCache = new Map<string, string>();

        function resolveUniversityId(sheetName: string): string {
            const nameUp = sheetName.toUpperCase().trim();
            if (uniIdCache.has(nameUp)) return uniIdCache.get(nameUp)!;

            // 1. Exact match
            let id = uniMap.get(nameUp) || '';
            if (!id) {
                // 2. Sheet name is a word in DB name or vice versa
                for (const [key, uid] of uniMap) {
                    if (nameUp.includes(key) || key.includes(nameUp)) {
                        id = uid;
                        break;
                    }
                }
            }
            if (!id) {
                // 3. Fuzzy: any word from sheet name matches any word from DB name
                const sheetWords = nameUp.split(/\s+/).filter(w => w.length >= 2);
                for (const { name: dbName, id: uid } of uniNames) {
                    const dbWords = dbName.split(/\s+/);
                    const match = sheetWords.some(sw => dbWords.some(dw =>
                        sw === dw || sw.includes(dw) || dw.includes(sw)
                    ));
                    if (match) { id = uid; break; }
                }
            }
            uniIdCache.set(nameUp, id);
            return id;
        }

        for (const classroom of parsed) {
            let uniId = targetUniversityId;
            if (!uniId) {
                uniId = resolveUniversityId(classroom.university_name);
            }

            if (!uniId) {
                skipped.push({ ...classroom, reason: `University "${classroom.university_name}" not found in DB` });
                continue;
            }
            resolved.push({ classroom, uniId });
            if (!campusMap.has(uniId)) missingCampusUniIds.add(uniId);
        }

        // Step 2: Batch-create all missing campuses in ONE query
        if (missingCampusUniIds.size > 0) {
            const uniIds = [...missingCampusUniIds];
            const vals = uniIds.flatMap(id => [id, 'Main Campus', 'MAIN']);
            const ph = uniIds.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(', ');
            await db.query(
                `INSERT INTO campuses (university_id, name, code) VALUES ${ph} ON CONFLICT DO NOTHING`,
                vals
            );
            // Re-fetch all campuses for these universities in one query
            const placeholders = uniIds.map((_, i) => `$${i+1}`).join(', ');
            const campResult = await db.query(
                `SELECT DISTINCT ON (university_id) id, university_id FROM campuses WHERE university_id IN (${placeholders}) ORDER BY university_id, created_at`,
                uniIds
            );
            for (const c of campResult.rows) campusMap.set(c.university_id, c.id);
        }

        // Step 3: Build toCreate array
        const toCreate: any[] = [];
        for (const { classroom, uniId } of resolved) {
            const campusId = campusMap.get(uniId);
            if (!campusId) {
                skipped.push({ ...classroom, reason: 'Could not find/create campus' });
                continue;
            }
            toCreate.push({
                university_id: uniId,
                campus_id: campusId,
                name: classroom.name,
                code: classroom.code,
                room_type: classroom.room_type,
                capacity: classroom.capacity,
                total_benches: classroom.total_benches,
                seats_per_bench: classroom.seats_per_bench,
                invigilators_required: classroom.invigilators_required,
                layout_type: 'grid',
                university_name: classroom.university_name
            });
        }

        // Direct batch insert — single query, no service overhead
        let created: any[] = [];
        if (toCreate.length > 0) {
            try {
                const results = await directBatchInsert(toCreate);
                created = results.map((room, i) => ({ ...room, university_name: toCreate[i]?.university_name }));
            } catch (e: any) {
                // Fallback: try smaller batches if parameter limit exceeded
                const BATCH_SIZE = 20;
                for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
                    const batch = toCreate.slice(i, i + BATCH_SIZE);
                    try {
                        const results = await directBatchInsert(batch);
                        created.push(...results.map((room, j) => ({ ...room, university_name: batch[j]?.university_name })));
                    } catch (err: any) {
                        skipped.push(...batch.map(d => ({ ...d, reason: err.message })));
                    }
                }
            }
        }

        return json({
            created: created.length,
            skipped: skipped.length,
            classrooms: created,
            skippedDetails: skipped,
            debug
        }, { status: 201 });
    }

    // Handle JSON import (legacy paste mode)
    const { universityId, rows } = await request.json();
    if (!universityId || !rows?.length) {
        throw error(400, 'universityId and rows[] required');
    }
    try {
        const created = await ClassroomService.bulkImportClassrooms(universityId, rows);
        return json({ created: created.length, classrooms: created }, { status: 201 });
    } catch (e: any) {
        console.error('[POST /api/academic/classrooms/import]', e.message);
        throw error(500, e.message);
    }
};
