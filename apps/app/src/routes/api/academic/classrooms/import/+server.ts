import { ClassroomService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import XLSX from 'xlsx';

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

    // Fallback: if column detection failed, use positional (A=uni, B=count, C=benches, D=students, E=maxcap, F=totalcap, G=invig, H=totalinvig, I=remarks)
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

        const classroomCount = parseInt(String(row[colMap.classrooms_count] || '0').replace(/[^\d]/g, '')) || 1;
        const benchesCell = String(row[colMap.benches] || '');
        const studentsPerBenchCell = String(row[colMap.students_per_bench] || '2');
        const maxCapCell = String(row[colMap.max_capacity] || '');
        const invigCell = String(row[colMap.invig_per_class] || '1');
        const remarksCell = colMap.remarks >= 0 ? String(row[colMap.remarks] || '') : '';

        // Parse students per bench — might be "3 in a big one\n2 in small one" or "1 student per bench" or just "2"
        let seatsPerBench = 2;
        const seatMatch = studentsPerBenchCell.match(/(\d+)/);
        if (seatMatch) seatsPerBench = parseInt(seatMatch[1]);

        // Parse benches cell — this is the complex one
        // Could be:
        // "24 (small class room)\n48 (large class room)"
        // "21 big\n2 small"
        // "35 & 40"
        // "60"
        // "80 seats" (these are seats, not benches)
        // "Hall 1  32\nHall 2  32\nHall 3  40\n..." (individual halls with bench counts)
        // "Section 1: 40\nSection 2: 25\n..."
        // "32(sec-3),28(sec-2),28(sec-1)"

        const benchLines = benchesCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const hallPattern = /^(hall|section|room)\s*(\d+)\s*[:\s]+(\d+)/i;
        const namedPattern = /^(.+?)\s+(\d+)\s*$/;
        const commaPattern = /(\d+)\s*\(([^)]+)\)/g;

        interface ClassroomSpec {
            name: string;
            benches: number;
            capacity: number;
            invigilators: number;
        }

        const specs: ClassroomSpec[] = [];

        // Check if benches cell contains "Hall 1: 32, Hall 2: 32" type individual listings
        const hasHallNames = benchLines.some(l => hallPattern.test(l));
        const hasCommaSeparated = [...benchesCell.matchAll(commaPattern)].length >= 2;

        if (hasHallNames) {
            // Each line is a named hall: "Hall 1  32"
            for (const line of benchLines) {
                const m = line.match(hallPattern) || line.match(namedPattern);
                if (m) {
                    const hallName = m[1] + (m[2] ? ' ' + m[2] : '');
                    const benchCount = parseInt(m[m.length === 4 ? 3 : 2]) || 30;
                    specs.push({
                        name: hallName.trim(),
                        benches: benchCount,
                        capacity: benchCount * seatsPerBench,
                        invigilators: 1
                    });
                }
            }
        } else if (hasCommaSeparated) {
            // "32(sec-3),28(sec-2),28(sec-1)"
            for (const m of benchesCell.matchAll(commaPattern)) {
                specs.push({
                    name: m[2].trim(),
                    benches: parseInt(m[1]),
                    capacity: parseInt(m[1]) * seatsPerBench,
                    invigilators: 1
                });
            }
        } else {
            // Generic: extract all numbers, distribute across classrooms
            const benchNums = (benchesCell.match(/\d+/g) || ['30']).map(Number).filter(n => n > 0);
            const capNums = (maxCapCell.match(/\d+/g) || []).map(Number).filter(n => n > 0);
            const invigNums = (invigCell.match(/\d+/g) || ['1']).map(Number).filter(n => n > 0);

            // Check if benches cell mentions "seats" — then benches = seats / seatsPerBench
            const isSeatCount = /seats?/i.test(benchesCell);

            for (let i = 0; i < classroomCount; i++) {
                let benchCount = benchNums[i % benchNums.length] || benchNums[0] || 30;
                if (isSeatCount) benchCount = Math.ceil(benchCount / seatsPerBench);
                const cap = capNums.length > 0
                    ? (capNums[i % capNums.length] || capNums[0])
                    : benchCount * seatsPerBench;
                const invig = invigNums[i % invigNums.length] || 1;

                const label = benchNums.length > 1 && benchNums[i % benchNums.length] >= 35 ? 'Large' :
                              benchNums.length > 1 ? 'Standard' : '';

                specs.push({
                    name: classroomCount === 1 ? 'Classroom 1' : `Classroom ${i + 1}${label ? ` (${label})` : ''}`,
                    benches: benchCount,
                    capacity: cap,
                    invigilators: invig
                });
            }
        }

        // Parse max capacity per classroom if individual specs don't have it
        const capNums = (maxCapCell.match(/\d+/g) || []).map(Number);
        const invigNums = (invigCell.match(/\d+/g) || []).map(Number);

        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            if (capNums.length > 0 && specs.length === 1) {
                spec.capacity = capNums[0];
            } else if (capNums.length >= specs.length) {
                spec.capacity = capNums[i];
            }
            if (invigNums.length >= specs.length) {
                spec.invigilators = invigNums[i];
            } else if (invigNums.length > 0) {
                spec.invigilators = invigNums[i % invigNums.length] || 1;
            }

            const benchCount = spec.benches;
            const bCols = Math.ceil(Math.sqrt(benchCount));
            const bRows = Math.ceil(benchCount / bCols);

            parsed.push({
                university_name: uniName,
                name: `${uniName} - ${spec.name}`,
                code: `${uniName.substring(0, 3).toUpperCase()}-R${i + 1}`,
                room_type: benchCount >= 40 ? 'HALL' : benchCount <= 5 ? 'LAB' : 'LECTURE',
                total_benches: benchCount,
                seats_per_bench: seatsPerBench,
                capacity: spec.capacity || benchCount * seatsPerBench,
                invigilators_required: spec.invigilators,
                remarks: remarksCell
            });
        }

        debug.push({
            row: r + 1,
            university: uniName,
            classrooms_parsed: specs.length,
            raw: { benchesCell, studentsPerBenchCell, maxCapCell, invigCell }
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

        // Match university names to DB records + pre-fetch all campuses (2 queries total)
        const [uniResult, campusResult] = await Promise.all([
            db.query(`SELECT id, name FROM universities`),
            db.query(`SELECT id, university_id FROM campuses`)
        ]);

        const uniMap = new Map<string, string>();
        for (const u of uniResult.rows) {
            uniMap.set(u.name.toUpperCase().trim(), u.id);
            const words = u.name.toUpperCase().split(/\s+/);
            for (const w of words) {
                if (w.length > 3) uniMap.set(w, u.id);
            }
        }

        // Cache campus IDs per university
        const campusMap = new Map<string, string>();
        for (const c of campusResult.rows) {
            if (!campusMap.has(c.university_id)) campusMap.set(c.university_id, c.id);
        }

        const toCreate: any[] = [];
        const skipped: any[] = [];

        for (const classroom of parsed) {
            let uniId = targetUniversityId;
            if (!uniId) {
                const nameUp = classroom.university_name.toUpperCase().trim();
                uniId = uniMap.get(nameUp) || '';
                if (!uniId) {
                    for (const [key, id] of uniMap) {
                        if (nameUp.includes(key) || key.includes(nameUp)) {
                            uniId = id;
                            break;
                        }
                    }
                }
            }

            if (!uniId) {
                skipped.push({ ...classroom, reason: `University "${classroom.university_name}" not found in DB` });
                continue;
            }

            // Get or create campus (cached)
            let campusId = campusMap.get(uniId);
            if (!campusId) {
                const nc = await db.query(
                    `INSERT INTO campuses (university_id, name, code) VALUES ($1, 'Main Campus', 'MAIN') ON CONFLICT DO NOTHING RETURNING id`,
                    [uniId]
                );
                campusId = nc.rows[0]?.id;
                if (!campusId) {
                    const existing = await db.query(`SELECT id FROM campuses WHERE university_id = $1 LIMIT 1`, [uniId]);
                    campusId = existing.rows[0]?.id;
                }
                if (campusId) campusMap.set(uniId, campusId);
            }

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

        // Batch insert all classrooms in one query
        let created: any[] = [];
        if (toCreate.length > 0) {
            try {
                const results = await ClassroomService.batchCreateClassrooms(toCreate);
                created = results.map((room, i) => ({ ...room, university_name: toCreate[i]?.university_name }));
            } catch (e: any) {
                // Fallback: if batch fails (e.g. mixed campus conflicts), insert one by one
                for (const data of toCreate) {
                    try {
                        const room = await ClassroomService.createClassroom(data);
                        created.push({ ...room, university_name: data.university_name });
                    } catch (err: any) {
                        skipped.push({ ...data, reason: err.message });
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
