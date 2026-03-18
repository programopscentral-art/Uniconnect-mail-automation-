import { ClassroomService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import XLSX from 'xlsx';

// Cache schema readiness so ALTER TABLE only runs once per server lifecycle
let schemaReady = false;

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
    name: string;
    code: string;
    room_type: string;
    total_benches: number;
    seats_per_bench: number;
    capacity: number;
    invigilators_required: number;
    remarks: string;
}

// ─── Utility functions ───────────────────────────────────────────

// Parse a number from text, handling ranges like "38-40" → average
function parseCount(text: string): number {
    const s = String(text || '').trim();
    if (!s) return 0;
    // Handle ranges: "38-40" → 39, "30 - 40" → 35
    const rangeMatch = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) return Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2);
    // Get first standalone number
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
}

// Extract all numbers from a string
function extractNumbers(text: string): number[] {
    return (text.match(/\d+/g) || []).map(Number).filter(n => n > 0);
}

// Sanity check seats_per_bench: a real bench seats 1-6 people
function sanitizeSeatsPerBench(n: number): number {
    if (n < 1 || n > 6 || isNaN(n)) return 2;
    return n;
}

// ─── Classroom spec ──────────────────────────────────────────────

interface ClassroomSpec {
    name: string;
    benches: number;       // bench count for this classroom
    seatsPerBench: number;
    capacity: number;      // from column E if available, else computed
    invigilators: number;
}

// ─── Main parser ─────────────────────────────────────────────────

function parseExcelClassrooms(buffer: ArrayBuffer): { classrooms: ParsedClassroom[], debug: any[] } {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    if (rows.length < 2) return { classrooms: [], debug: [] };

    // Detect header row
    let headerRow = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const rowText = rows[i].map((c: any) => String(c).toLowerCase()).join(' ');
        if (rowText.includes('university') || rowText.includes('name of')) {
            headerRow = i;
            break;
        }
    }

    const headers = rows[headerRow].map((h: any) => String(h).toLowerCase().trim());

    // Map columns by header keywords
    const colMap = { university: -1, classrooms_count: -1, benches: -1, students_per_bench: -1, max_capacity: -1, total_capacity: -1, invig_per_class: -1, total_invig: -1, remarks: -1 };

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if ((h.includes('name') && h.includes('university')) || (i === 0 && h.includes('university'))) colMap.university = i;
        else if (h.includes('how many classroom') || h.includes('classrooms can be allocated') || h.includes('allocated')) colMap.classrooms_count = i;
        else if (h.includes('bench') && (h.includes('available') || h.includes('each'))) colMap.benches = i;
        else if (h.includes('student') && (h.includes('seated') || h.includes('bench') || h.includes('each bench'))) colMap.students_per_bench = i;
        else if (h.includes('maximum') && h.includes('accommodate')) colMap.max_capacity = i;
        else if (h.includes('total') && (h.includes('number') || h.includes('accommodat'))) colMap.total_capacity = i;
        else if ((h.includes('invig') || h.includes('instructor')) && !h.includes('total') && (h.includes('each') || h.includes('assign') || h.includes('class'))) colMap.invig_per_class = i;
        else if ((h.includes('total') && h.includes('invig')) || (h.includes('total') && h.includes('instructor'))) colMap.total_invig = i;
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

        // ── Read raw cell values ──
        const countCell = String(row[colMap.classrooms_count] || '');
        const benchesCell = String(row[colMap.benches] || '');
        const seatsCell = String(row[colMap.students_per_bench] || '');
        const maxCapCell = String(row[colMap.max_capacity] || '');
        const totalCapCell = String(row[colMap.total_capacity] || '');
        const invigCell = String(row[colMap.invig_per_class] || '');
        const remarksCell = colMap.remarks >= 0 ? String(row[colMap.remarks] || '') : '';

        // ── Parse classroom count from B ──
        // Handle long text like "Since the exams... Usually around 11 classrooms are used."
        let classroomCount = parseCount(countCell) || 1;
        // Cap at reasonable max to prevent runaway
        if (classroomCount > 100) classroomCount = Math.min(classroomCount, 50);

        // ── Parse seats per bench from D ──
        // SANITY: cap at 6 — values like 80 mean they entered total capacity by mistake
        const rawSeatsPerBench = parseCount(seatsCell);
        const seatsPerBench = sanitizeSeatsPerBench(rawSeatsPerBench);

        // Parse multi-line D for different seat counts per type: "3 in a big one\n2 in small one"
        const seatLines = seatsCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const seatNums = seatLines.map(l => sanitizeSeatsPerBench(parseCount(l)));

        // ── Parse total capacity from F ──
        const totalCapacity = parseCount(totalCapCell) || 0;

        // ── Parse invigilators from G ──
        const defaultInvig = Math.max(1, parseCount(invigCell) || 1);

        // ── Parse bench specs from C (the complex column) ──
        // IMPORTANT: Numbers in column C are ALWAYS bench/desk counts, never student counts.
        // Even if text says "seats" or "desks", the number is how many physical units exist.
        const benchLines = benchesCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const isDesks = /\bdesks?\b/i.test(benchesCell);

        const specs: ClassroomSpec[] = [];

        // ─ Pattern 1: Named rooms (CDU halls, SGU sections, Yenepoya classrooms) ─
        // "Hall 1  32", "Section 1: 40", "Classroom 1 – 77 desks", "5.0 lab:5"
        const namedRoomPattern = /(?:hall|section|room|block|classroom)\s*[-.]?\s*(\d+)\s*[-–—:\s]+\s*(\d+)/gi;
        const namedMatches = [...benchesCell.matchAll(namedRoomPattern)];

        // "Classroom 1 – 77 desks"
        const classroomDashPattern = /(?:classroom|class|room)\s*(\d+)\s*[-–—]+\s*(\d+)\s*(?:desks?|benches?|seats?)?/gi;
        const dashMatches = [...benchesCell.matchAll(classroomDashPattern)];

        // "Section 1: 40", "Section 2: 25" (numbered sections)
        const sectionNumPattern = /section\s*(\d+)\s*[-–—:\s]+\s*(\d+)/gi;
        const sectionNumMatches = [...benchesCell.matchAll(sectionNumPattern)];

        // "section A - 8 , Section B &C -12" (letter sections — AMET)
        const sectionLetterPattern = /section\s*([A-Z])\s*(?:[&,]\s*([A-Z]))?\s*[-–—:]+\s*(\d+)/gi;
        const sectionLetterMatches = [...benchesCell.matchAll(sectionLetterPattern)];

        // "label:number" style — "5.0 lab:5"
        const labelColonPattern = /^(.+?)\s*:\s*(\d+)\s*$/i;

        if (sectionNumMatches.length >= 2 || namedMatches.length >= 2 || dashMatches.length >= 2) {
            // CDU-style halls, SGU-style numbered sections, or Yenepoya classrooms
            // Pick the match set with most entries
            let bestMatches = namedMatches;
            if (sectionNumMatches.length > bestMatches.length) bestMatches = sectionNumMatches;
            if (dashMatches.length > bestMatches.length) bestMatches = dashMatches;

            for (const m of bestMatches) {
                const roomNum = m[1];
                const benchCount = parseInt(m[2]) || 30;
                const label = /section/i.test(m[0]) ? `Section ${roomNum}` : (isDesks ? `Classroom ${roomNum}` : `Hall ${roomNum}`);

                specs.push({
                    name: label,
                    benches: benchCount,
                    seatsPerBench: seatsPerBench,
                    capacity: benchCount * seatsPerBench,
                    invigilators: defaultInvig
                });
            }
            // Also check for non-matching lines like "5.0 lab:5"
            for (const line of benchLines) {
                namedRoomPattern.lastIndex = 0;
                classroomDashPattern.lastIndex = 0;
                sectionNumPattern.lastIndex = 0;
                if (namedRoomPattern.test(line) || classroomDashPattern.test(line) || sectionNumPattern.test(line)) continue;
                namedRoomPattern.lastIndex = 0;
                classroomDashPattern.lastIndex = 0;
                sectionNumPattern.lastIndex = 0;
                const m = line.match(labelColonPattern);
                if (m) {
                    const benchCount = parseInt(m[2]) || 0;
                    if (benchCount > 0) {
                        specs.push({
                            name: m[1].trim(),
                            benches: benchCount,
                            seatsPerBench: seatsPerBench,
                            capacity: benchCount * seatsPerBench,
                            invigilators: defaultInvig
                        });
                    }
                }
            }
        } else if (sectionLetterMatches.length >= 1) {
            // AMET-style: "section A - 8 , Section B &C -12"
            // Expand compound sections: "B &C" → Section B and Section C both get same bench count
            for (const m of sectionLetterMatches) {
                const letter1 = m[1];
                const letter2 = m[2] || ''; // e.g. "C" from "B &C"
                const benchCount = parseInt(m[3]) || 0;
                if (benchCount > 0) {
                    specs.push({
                        name: `Section ${letter1}`,
                        benches: benchCount,
                        seatsPerBench: seatsPerBench,
                        capacity: benchCount * seatsPerBench,
                        invigilators: defaultInvig
                    });
                    if (letter2) {
                        specs.push({
                            name: `Section ${letter2}`,
                            benches: benchCount,
                            seatsPerBench: seatsPerBench,
                            capacity: benchCount * seatsPerBench,
                            invigilators: defaultInvig
                        });
                    }
                }
            }
        } else {
            // ─ Pattern 2: Parenthetical types ─
            // "24 ( small class room )\n48 ( large class room )" or "32(sec-3),28(sec-2),28(sec-1)"
            // or "35(Large Class Rooms)\n30(Small Class Rooms)"
            const parenPattern = /(\d+)\s*\(\s*([^)]+)\s*\)/g;
            const parenMatches = [...benchesCell.matchAll(parenPattern)];

            if (parenMatches.length >= 2) {
                const typeSpecs: { benches: number; label: string; spb: number }[] = [];
                for (let pi = 0; pi < parenMatches.length; pi++) {
                    const m = parenMatches[pi];
                    const benchCount = parseInt(m[1]);
                    const label = m[2].trim();
                    const spb = seatNums[pi] || seatsPerBench;
                    typeSpecs.push({ benches: benchCount, label, spb });
                }

                // If types match classroomCount, each type is one room (NRI: 3 rooms, 3 matches)
                if (typeSpecs.length === classroomCount) {
                    for (const ts of typeSpecs) {
                        specs.push({
                            name: ts.label,
                            benches: ts.benches,
                            seatsPerBench: ts.spb,
                            capacity: ts.benches * ts.spb,
                            invigilators: defaultInvig
                        });
                    }
                } else {
                    // Fewer types than classrooms: distribute evenly
                    // Annamacharya: 2 types (small/large), 4 classrooms → 2 of each
                    const perType = Math.ceil(classroomCount / typeSpecs.length);
                    let idx = 0;
                    for (const ts of typeSpecs) {
                        const count = Math.min(perType, classroomCount - idx);
                        for (let j = 0; j < count; j++) {
                            specs.push({
                                name: `${ts.label} ${count > 1 ? j + 1 : ''}`.trim(),
                                benches: ts.benches,
                                seatsPerBench: ts.spb,
                                capacity: ts.benches * ts.spb,
                                invigilators: defaultInvig
                            });
                            idx++;
                        }
                    }
                }
            } else {
                // ─ Pattern 3: Multi-line with labels ─
                // "21 big\n2 small" or "minimum 24 benches\nmax 35 benches"
                const hasTypedLines = benchLines.length >= 2 && benchLines.every(l => /^\d+\s+\S/.test(l) || /\b\d+\b/.test(l));
                const isMinMax = /\b(min|max|minimum|maximum)\b/i.test(benchesCell);

                if (hasTypedLines && !isMinMax) {
                    // MRV-style: "21 big\n2 small" — bench types within each room
                    const typeSpecs: { benches: number; label: string; spb: number }[] = [];
                    for (let li = 0; li < benchLines.length; li++) {
                        const m = benchLines[li].match(/^(\d+)\s+(.+)/);
                        if (m) {
                            const benchCount = parseInt(m[1]);
                            const spb = seatNums[li] || seatsPerBench;
                            typeSpecs.push({ benches: benchCount, label: m[2].trim(), spb });
                        }
                    }

                    // Cross-check with E: if E gives single value, ALL rooms have same layout (mixed bench types)
                    // MRV: "21 big + 2 small" = 23 benches/room, E=70 → 23×3≈70 ✓
                    const singleCapacity = extractNumbers(maxCapCell);
                    if (singleCapacity.length === 1 && typeSpecs.length >= 2) {
                        const totalBenchesPerRoom = typeSpecs.reduce((sum, ts) => sum + ts.benches, 0);
                        for (let i = 0; i < classroomCount; i++) {
                            specs.push({
                                name: `Classroom ${i + 1}`,
                                benches: totalBenchesPerRoom,
                                seatsPerBench: seatsPerBench,
                                capacity: singleCapacity[0],
                                invigilators: defaultInvig
                            });
                        }
                    } else {
                        const perType = Math.ceil(classroomCount / typeSpecs.length);
                        let idx = 0;
                        for (const ts of typeSpecs) {
                            const count = Math.min(perType, classroomCount - idx);
                            for (let j = 0; j < count; j++) {
                                specs.push({
                                    name: `Classroom ${idx + 1} (${ts.label})`,
                                    benches: ts.benches,
                                    seatsPerBench: ts.spb,
                                    capacity: ts.benches * ts.spb,
                                    invigilators: defaultInvig
                                });
                                idx++;
                            }
                        }
                    }
                } else {
                    // ─ Pattern 4: Simple numbers ─
                    // "35 & 40", "60", "80 seats", "90 seats each class room", "160"
                    // "minimum 24 benches max 35 benches", "21 students, and in some classes 28"
                    let benchNums = extractNumbers(benchesCell);
                    if (benchNums.length === 0) benchNums = [30];

                    // Filter out noise numbers (e.g. from "4 in middle row & 3 in side rows" → [4, 3])
                    // If we have capacity from E, use it to validate bench numbers
                    // Numbers in C are bench counts — DO NOT divide by spb

                    // Check if single number might be TOTAL benches (not per-classroom)
                    // NIU: 160 benches total, 8 classrooms → 20 each
                    // BUT ADYPU: "90 seats each class room" → 90 is per-room, NOT total
                    // Heuristic: if benches * spb ≈ E (max cap per room), it's per-room
                    const eCapPerRoom = parseCount(maxCapCell) || 0;
                    if (benchNums.length === 1 && classroomCount > 1 && benchNums[0] > classroomCount * 15) {
                        const perRoomProduct = benchNums[0] * seatsPerBench;
                        const dividedProduct = Math.ceil(benchNums[0] / classroomCount) * seatsPerBench;
                        // If per-room value matches E capacity, keep it as per-room
                        if (eCapPerRoom > 0 && Math.abs(perRoomProduct - eCapPerRoom) <= eCapPerRoom * 0.2) {
                            // 90 * 1 = 90 ≈ E(90) → per-room, don't divide
                        } else {
                            benchNums[0] = Math.ceil(benchNums[0] / classroomCount);
                        }
                    }

                    // SVyasa "minimum 24 benches max 35 benches" → [24, 35] → range → avg 30
                    if (isMinMax && benchNums.length === 2) {
                        benchNums = [Math.round((benchNums[0] + benchNums[1]) / 2)];
                    }

                    for (let i = 0; i < classroomCount; i++) {
                        const benchCount = benchNums[i % benchNums.length] || benchNums[0] || 30;
                        const label = benchNums.length > 1 && !isMinMax
                            ? (benchCount >= Math.max(...benchNums) * 0.8 ? 'Large' : 'Standard')
                            : '';

                        specs.push({
                            name: classroomCount === 1
                                ? 'Classroom 1'
                                : `Classroom ${i + 1}${label ? ` (${label})` : ''}`,
                            benches: benchCount,
                            seatsPerBench: seatsPerBench,
                            capacity: benchCount * seatsPerBench,
                            invigilators: defaultInvig
                        });
                    }
                }
            }
        }

        // ── Override with max capacity from E (ground truth) ──
        const capLines = maxCapCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        let capValues: number[] = [];

        // Check for named capacity lines: "Classroom 1 – 41", "86(sec-3)", "Section 1: 120", "section A - 29"
        const namedCapPattern = /(?:classroom|hall|section|room|block)\s*[-.]?\s*(?:\d+|[A-Z](?:\s*[&,]\s*[A-Z])*)\s*[-–—:\s]+\s*(\d+)/gi;
        const parenCapPattern = /(\d+)\s*\(\s*[^)]+\s*\)/g;
        const hasNamedCaps = capLines.some(l => namedCapPattern.test(l) || parenCapPattern.test(l));
        namedCapPattern.lastIndex = 0;
        parenCapPattern.lastIndex = 0;

        if (hasNamedCaps) {
            // Extract the capacity number from each named entry
            for (const line of capLines) {
                // Try "86(sec-3)" first
                const pm = line.match(/(\d+)\s*\(/);
                if (pm) { capValues.push(parseInt(pm[1])); continue; }
                // Try "section B & C - 48" (compound — push once for EACH letter)
                const compoundMatch = line.match(/section\s*([A-Z])\s*[&,]\s*([A-Z])\s*[-–—:]+\s*(\d+)/i);
                if (compoundMatch) {
                    capValues.push(parseInt(compoundMatch[3]));
                    capValues.push(parseInt(compoundMatch[3])); // same cap for both
                    continue;
                }
                // Try "Classroom 1 – 41" or "Section 1: 120" or "section A - 29"
                const nm = line.match(/[-–—:\s]\s*(\d+)\s*$/);
                if (nm) { capValues.push(parseInt(nm[1])); continue; }
                // Fallback: last number in line
                const nums = extractNumbers(line);
                if (nums.length > 0) capValues.push(nums[nums.length - 1]);
            }
        } else {
            // Simple: "70", "70 & 80", "30 - 40", "63 to 84"
            capValues = extractNumbers(maxCapCell);
            // Handle range: "30 - 40" → [30, 40] but should be treated as single avg value
            if (capValues.length === 2 && maxCapCell.match(/\d+\s*[-–—to]+\s*\d+/i)) {
                capValues = [Math.round((capValues[0] + capValues[1]) / 2)];
            }
            // If E column is descriptive text with many numbers, filter to likely capacities (>= 10)
            // e.g. Chalapathi: "If 3 Per Bench 105 members or if 2 per bench 70 members\n2 per bench - 60"
            // → raw [3, 105, 2, 70, 2, 60] → filtered [105, 70, 60]
            if (capValues.length > specs.length && capValues.some(v => v < 10)) {
                capValues = capValues.filter(v => v >= 10);
            }
        }

        // Apply capacity overrides to specs — E column is ground truth WHEN it has clean data
        // Skip override when E is too verbose (descriptive text rather than numbers)
        const eWordCount = maxCapCell.split(/\s+/).filter(w => w.length > 0).length;
        const eNumCount = capValues.length;
        const eIsDescriptive = eWordCount > 15 && eNumCount > specs.length;
        if (capValues.length > 0 && !eIsDescriptive) {
            for (let i = 0; i < specs.length; i++) {
                const cap = capValues.length >= specs.length
                    ? capValues[i]
                    : capValues.length === 1
                        ? capValues[0]
                        : capValues[i % capValues.length];
                if (cap && cap > 0) {
                    specs[i].capacity = cap;
                    const benches = specs[i].benches;
                    const spb = specs[i].seatsPerBench;
                    const computed = benches * spb;

                    // If benches × spb doesn't match capacity, figure out which to fix
                    if (Math.abs(computed - cap) > cap * 0.15 && benches > 0) {
                        // Try to infer correct spb from capacity / benches
                        const inferredSpb = Math.round(cap / benches);
                        if (inferredSpb >= 1 && inferredSpb <= 6 && Math.abs(benches * inferredSpb - cap) <= cap * 0.15) {
                            // Adjusting spb gives a good match — use it
                            // e.g. NIU: 20 benches, cap 40 → spb=2; Crescent: 60 benches, cap 60 → spb=1
                            specs[i].seatsPerBench = inferredSpb;
                        } else {
                            // Can't fix spb cleanly — adjust bench count instead
                            specs[i].benches = Math.ceil(cap / spb);
                        }
                    }
                }
            }
        }

        // ── Cross-validate with total capacity F ──
        if (totalCapacity > 0 && specs.length > 0) {
            const sumCap = specs.reduce((s, sp) => s + sp.capacity, 0);
            // If our total is way off from F, scale capacities
            if (Math.abs(sumCap - totalCapacity) > totalCapacity * 0.2 && sumCap > 0) {
                const ratio = totalCapacity / sumCap;
                for (const spec of specs) {
                    spec.capacity = Math.round(spec.capacity * ratio);
                    if (spec.seatsPerBench > 0) {
                        spec.benches = Math.ceil(spec.capacity / spec.seatsPerBench);
                    }
                }
            }
        }

        // ── Parse invigilators from G (per-classroom) ──
        // Handle named patterns like "Section 1: 1\nSection 2: 1\nSection 4: 2\n5.0 lab:1"
        const invigLines = invigCell.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const namedInvigPattern = /(?:section|hall|classroom|room|lab)\s*[-.\s]?\s*(?:\d+|[A-Z])\s*[-–—:\s]+\s*(\d+)/gi;
        const hasNamedInvig = invigLines.some(l => namedInvigPattern.test(l));
        namedInvigPattern.lastIndex = 0;

        if (hasNamedInvig && invigLines.length >= specs.length) {
            // Extract per-room invigilator counts from named lines
            const invigPerRoom: number[] = [];
            for (const line of invigLines) {
                const nums = extractNumbers(line);
                if (nums.length > 0) invigPerRoom.push(nums[nums.length - 1]);
            }
            for (let i = 0; i < specs.length; i++) {
                specs[i].invigilators = Math.max(1, invigPerRoom[i] || defaultInvig);
            }
        } else {
            // Filter to reasonable invig numbers (1-10) — ignore bench counts that leak in
            // e.g. "1 Invigilator enough if small\n2 invigilators, if benches consists 48" → [1, 2] not [1, 2, 48]
            const invigNums = extractNumbers(invigCell).filter(n => n >= 1 && n <= 10);
            if (invigNums.length > 0) {
                for (let i = 0; i < specs.length; i++) {
                    specs[i].invigilators = invigNums.length >= specs.length
                        ? Math.max(1, invigNums[i] || defaultInvig)
                        : Math.max(1, invigNums[i % invigNums.length] || defaultInvig);
                }
            }
        }

        // ── Final: ensure no zero-bench classrooms ──
        for (const spec of specs) {
            if (spec.benches <= 0 && spec.capacity > 0 && spec.seatsPerBench > 0) {
                spec.benches = Math.ceil(spec.capacity / spec.seatsPerBench);
            }
            if (spec.benches <= 0) spec.benches = 20; // reasonable default
            if (spec.capacity <= 0) spec.capacity = spec.benches * spec.seatsPerBench;
        }

        // ── Emit parsed classrooms ──
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            parsed.push({
                university_name: uniName,
                name: `${uniName} - ${spec.name}`,
                code: `${uniName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '')}-R${r}-${i + 1}`,
                room_type: spec.benches >= 40 ? 'HALL' : spec.benches <= 5 ? 'LAB' : 'LECTURE',
                total_benches: spec.benches,
                seats_per_bench: spec.seatsPerBench,
                capacity: spec.capacity,
                invigilators_required: spec.invigilators,
                remarks: remarksCell
            });
        }

        debug.push({
            row: r + 1,
            university: uniName,
            classrooms_parsed: specs.length,
            specs: specs.map(s => ({ name: s.name, benches: s.benches, spb: s.seatsPerBench, cap: s.capacity, invig: s.invigilators })),
            raw: { countCell, benchesCell, seatsCell, maxCapCell, totalCapCell, invigCell, classroomCount }
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
        const t0 = Date.now();
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const targetUniversityId = formData.get('universityId') as string;

        if (!file) throw error(400, 'No file uploaded');

        const buffer = await file.arrayBuffer();
        console.log(`[import] file read: ${Date.now() - t0}ms`);

        const t1 = Date.now();
        const { classrooms: parsed, debug } = parseExcelClassrooms(buffer);
        console.log(`[import] parsed ${parsed.length} classrooms: ${Date.now() - t1}ms`);

        if (parsed.length === 0) {
            return json({
                error: 'No classrooms found in the file',
                debug,
                hint: 'Make sure the sheet has columns: University Name, Classrooms Count, Benches per Classroom, Students per Bench, Max Capacity, Total Capacity, Invigilators'
            }, { status: 400 });
        }

        // Schema migration: fast check first, only run heavy DDL if needed
        const t2 = Date.now();
        if (!schemaReady) {
            const check = await db.query(`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'classrooms_university_id_campus_id_code_key') as ready`);
            if (check.rows[0]?.ready) {
                schemaReady = true;
            } else {
                await db.query(`
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
                `);
                schemaReady = true;
            }
        }
        console.log(`[import] schema check: ${Date.now() - t2}ms`);

        // Fetch universities + campuses in parallel
        const t3 = Date.now();
        const [uniResult, campusResult] = await Promise.all([
            db.query(`SELECT id, name FROM universities`),
            db.query(`SELECT id, university_id FROM campuses`)
        ]);
        console.log(`[import] DB lookups: ${Date.now() - t3}ms`);

        // Build university name → id map
        const uniMap = new Map<string, string>();
        const uniNames: { name: string; id: string }[] = [];
        for (const u of uniResult.rows) {
            const nameUp = u.name.toUpperCase().trim();
            uniMap.set(nameUp, u.id);
            uniNames.push({ name: nameUp, id: u.id });
            // Index words (>= 2 chars to match "MRV", "NRI", "SGU", "CDU", "NIU", "VGU")
            for (const w of nameUp.split(/\s+/)) {
                if (w.length >= 2 && !['OF', 'THE', 'AND', 'FOR', 'IN', 'AT', 'TO', 'BY', 'IS', 'IT', 'OR', 'AN'].includes(w)) {
                    uniMap.set(w, u.id);
                }
            }
            // Also generate common abbreviation from initials
            const initials = nameUp.split(/\s+/).filter(w => !['OF', 'THE', 'AND', 'FOR', 'IN', 'AT', 'TO', 'BY', 'IS', 'IT', 'OR', 'AN', 'UNIVERSITY', '&'].includes(w)).map(w => w[0]).join('');
            if (initials.length >= 2) uniMap.set(initials, u.id);
        }

        // Known abbreviation aliases for common university short names
        const abbreviationAliases: Record<string, string[]> = {};
        for (const u of uniResult.rows) {
            const nameUp = u.name.toUpperCase().trim();
            // "Ajeenkya DY Patil University" → ADYPU
            if (nameUp.includes('PATIL')) abbreviationAliases['ADYPU'] = [u.id];
            if (nameUp.includes('MARITIME') || nameUp.includes('AMET')) abbreviationAliases['AMET'] = [u.id];
            if (nameUp.includes('MALLAREDDY') || nameUp.includes('MALLA REDDY')) { abbreviationAliases['MRV'] = [u.id]; abbreviationAliases['MALLAREDDY'] = [u.id]; }
            if (nameUp.includes('CHEVELLA') || nameUp.includes('NIAT')) abbreviationAliases['CHEVELLA'] = [u.id];
            if (nameUp.includes('CRESCENT')) abbreviationAliases['CRESCENT'] = [u.id];
            if (nameUp.includes('NSRIT')) abbreviationAliases['NSRIT'] = [u.id];
            if (nameUp.includes('NRI')) abbreviationAliases['NRI'] = [u.id];
            if (nameUp.includes('CHALAPATHI')) abbreviationAliases['CHALAPATHI'] = [u.id];
            if (nameUp.includes('CDU')) abbreviationAliases['CDU'] = [u.id];
            if (nameUp.includes('GHODAWAT')) { abbreviationAliases['SGU'] = [u.id]; abbreviationAliases['SANJAY GHODAWAT'] = [u.id]; }
            if (nameUp.includes('VYASA') || nameUp.includes('S-VYASA')) abbreviationAliases['SVYASA'] = [u.id];
            if (nameUp.includes('YENEPOYA')) abbreviationAliases['YENEPOYA'] = [u.id];
            if (nameUp.includes('NOIDA')) abbreviationAliases['NIU'] = [u.id];
            if (nameUp.includes('VGU')) abbreviationAliases['VGU'] = [u.id];
            if (nameUp.includes('TAKSHASHILA')) abbreviationAliases['TAKSHASHILA'] = [u.id];
            if (nameUp.includes('ANNAMACHARYA')) abbreviationAliases['ANNAMACHARYA'] = [u.id];
            if (nameUp.includes('AURORA')) abbreviationAliases['AURORA'] = [u.id];
        }
        for (const [alias, ids] of Object.entries(abbreviationAliases)) {
            if (ids[0] && !uniMap.has(alias)) uniMap.set(alias, ids[0]);
        }

        // Campus map
        const campusMap = new Map<string, string>();
        for (const c of campusResult.rows) {
            if (!campusMap.has(c.university_id)) campusMap.set(c.university_id, c.id);
        }

        // University name resolver with caching
        const uniIdCache = new Map<string, string>();
        function resolveUniversityId(sheetName: string): string {
            const nameUp = sheetName.toUpperCase().trim();
            if (uniIdCache.has(nameUp)) return uniIdCache.get(nameUp)!;

            // Also try without common suffixes/prefixes
            const normalized = nameUp.replace(/\s*(UNIVERSITY|INSTITUTE|COLLEGE|OF TECHNOLOGY|DEEMED)\s*/g, '').trim();
            let id = uniMap.get(nameUp) || uniMap.get(normalized) || '';
            if (!id) {
                // Substring match: "Chevella" matches "NIAT Chevella"
                for (const [key, uid] of uniMap) {
                    if (nameUp.includes(key) || key.includes(nameUp) || normalized.includes(key) || key.includes(normalized)) {
                        id = uid; break;
                    }
                }
            }
            if (!id) {
                // Word-level fuzzy match
                const sheetWords = nameUp.split(/\s+/).filter(w => w.length >= 2);
                for (const { name: dbName, id: uid } of uniNames) {
                    const dbWords = dbName.split(/\s+/);
                    if (sheetWords.some(sw => dbWords.some(dw => sw === dw || sw.includes(dw) || dw.includes(sw)))) {
                        id = uid; break;
                    }
                }
            }
            uniIdCache.set(nameUp, id);
            return id;
        }

        const skipped: any[] = [];
        const resolved: { classroom: ParsedClassroom; uniId: string }[] = [];
        const missingCampusUniIds = new Set<string>();

        for (const classroom of parsed) {
            const uniId = targetUniversityId || resolveUniversityId(classroom.university_name);
            if (!uniId) {
                skipped.push({ ...classroom, reason: `University "${classroom.university_name}" not found in DB` });
                continue;
            }
            resolved.push({ classroom, uniId });
            if (!campusMap.has(uniId)) missingCampusUniIds.add(uniId);
        }

        // Batch-create missing campuses
        const t4 = Date.now();
        if (missingCampusUniIds.size > 0) {
            const uniIds = [...missingCampusUniIds];
            const vals = uniIds.flatMap(id => [id, 'Main Campus', 'MAIN']);
            const ph = uniIds.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(', ');
            await db.query(`INSERT INTO campuses (university_id, name, code) VALUES ${ph} ON CONFLICT DO NOTHING`, vals);
            const placeholders = uniIds.map((_, i) => `$${i+1}`).join(', ');
            const campResult = await db.query(
                `SELECT DISTINCT ON (university_id) id, university_id FROM campuses WHERE university_id IN (${placeholders}) ORDER BY university_id, created_at`,
                uniIds
            );
            for (const c of campResult.rows) campusMap.set(c.university_id, c.id);
        }

        // Build toCreate
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

        // Batch insert
        console.log(`[import] resolve + campus: ${Date.now() - t4}ms, toCreate: ${toCreate.length}, skipped: ${skipped.length}`);
        const t5 = Date.now();
        let created: any[] = [];
        if (toCreate.length > 0) {
            try {
                const results = await directBatchInsert(toCreate);
                created = results.map((room, i) => ({ ...room, university_name: toCreate[i]?.university_name }));
            } catch (e: any) {
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

        console.log(`[import] batch insert: ${Date.now() - t5}ms, created: ${created.length}`);
        console.log(`[import] TOTAL: ${Date.now() - t0}ms`);

        return json({
            created: created.length,
            skipped: skipped.length,
            classrooms: created,
            skippedDetails: skipped,
            debug
        }, { status: 201 });
    }

    // Handle JSON import (legacy)
    const { universityId, rows } = await request.json();
    if (!universityId || !rows?.length) throw error(400, 'universityId and rows[] required');
    try {
        const created = await ClassroomService.bulkImportClassrooms(universityId, rows);
        return json({ created: created.length, classrooms: created }, { status: 201 });
    } catch (e: any) {
        console.error('[POST /api/academic/classrooms/import]', e.message);
        throw error(500, e.message);
    }
};
