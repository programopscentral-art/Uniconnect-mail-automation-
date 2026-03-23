import { ClassroomService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import XLSX from 'xlsx';

// VERSION TAG — change this to verify server is running latest code
const PARSER_VERSION = 'v3-2026-03-23';

let schemaReady = false;

async function directBatchInsert(classrooms: any[]): Promise<any[]> {
    if (classrooms.length === 0) return [];
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
        `INSERT INTO classrooms (university_id, campus_id, name, code, room_type, capacity, floor, building, total_benches, seats_per_bench, bench_rows, bench_columns, layout_type, invigilators_required, metadata_json)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (university_id, campus_id, code) DO UPDATE SET
           name = EXCLUDED.name, capacity = EXCLUDED.capacity, total_benches = EXCLUDED.total_benches,
           seats_per_bench = EXCLUDED.seats_per_bench, bench_rows = EXCLUDED.bench_rows, bench_columns = EXCLUDED.bench_columns,
           invigilators_required = EXCLUDED.invigilators_required, room_type = EXCLUDED.room_type, metadata_json = EXCLUDED.metadata_json
         RETURNING *`,
        values
    );
    return result.rows;
}

// ─── Simple utility functions ───
function getFirstNumber(text: string): number {
    const m = String(text || '').match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
}

function getAllNumbers(text: string): number[] {
    return (String(text || '').match(/\d+/g) || []).map(Number).filter(n => n > 0);
}

function clampSpb(n: number): number {
    return (n >= 1 && n <= 6) ? n : 2;
}

// ─── Spec for one classroom ───
interface RoomSpec {
    name: string;
    benches: number;
    spb: number;
    capacity: number;
    invig: number;
}

// ─── Main parser — simple and direct ───
function parseExcelClassrooms(buffer: ArrayBuffer): { classrooms: any[], debug: any[] } {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (rows.length < 2) return { classrooms: [], debug: [] };

    // Find header row
    let hdr = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        if (rows[i].some((c: any) => /university|name of/i.test(String(c)))) { hdr = i; break; }
    }

    const parsed: any[] = [];
    const debug: any[] = [];

    for (let r = hdr + 1; r < rows.length; r++) {
        const row = rows[r];
        const uniName = String(row[0] || '').trim();
        if (!uniName) continue;

        const colB = String(row[1] || '');   // classroom count
        const colC = String(row[2] || '');   // benches info
        const colD = String(row[3] || '');   // students per bench
        const colE = String(row[4] || '');   // max capacity per classroom
        const colF = String(row[5] || '');   // total capacity
        const colG = String(row[6] || '');   // invigilators per class
        const colI = String(row[8] || '');   // remarks

        const classroomCount = Math.max(1, getFirstNumber(colB));
        const rawSpb = getFirstNumber(colD);
        const spb = clampSpb(rawSpb);
        const defaultInvig = Math.max(1, getFirstNumber(colG));

        const specs: RoomSpec[] = [];

        // ── Try Pattern: Named rooms with numbers ──
        // "Hall 1: 32", "Section 1: 40", "Classroom 1 – 77 desks"
        const namedPattern = /(?:hall|section|classroom|class|room|block)\s*[-.]?\s*(\d+|[A-Z])\s*(?:[&,]\s*([A-Z]))?\s*[-–—:\s]+\s*(\d+)/gi;
        const namedMatches = [...colC.matchAll(namedPattern)];

        // "5.0 lab: 5" style
        const labelColonPattern = /^(.+?)\s*:\s*(\d+)\s*$/i;

        if (namedMatches.length >= 2) {
            // CDU halls, SGU sections, Yenepoya classrooms
            for (const m of namedMatches) {
                const id = m[1];
                const compoundId = m[2]; // e.g. "C" from "B &C"
                const benchCount = parseInt(m[3]) || 30;
                const isSection = /section/i.test(m[0]);
                const isDash = /classroom|class/i.test(m[0]);
                const label = isSection ? `Section ${id}` : isDash ? `Classroom ${id}` : `Hall ${id}`;
                specs.push({ name: label, benches: benchCount, spb, capacity: benchCount * spb, invig: defaultInvig });
                // Handle compound: "Section B &C - 12" → also create Section C
                if (compoundId) {
                    const label2 = isSection ? `Section ${compoundId}` : isDash ? `Classroom ${compoundId}` : `Hall ${compoundId}`;
                    specs.push({ name: label2, benches: benchCount, spb, capacity: benchCount * spb, invig: defaultInvig });
                }
            }
            // Also pick up non-matching lines like "5.0 lab: 5"
            const lines = colC.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
            for (const line of lines) {
                namedPattern.lastIndex = 0;
                if (namedPattern.test(line)) { namedPattern.lastIndex = 0; continue; }
                namedPattern.lastIndex = 0;
                const lm = line.match(labelColonPattern);
                if (lm && parseInt(lm[2]) > 0) {
                    specs.push({ name: lm[1].trim(), benches: parseInt(lm[2]), spb, capacity: parseInt(lm[2]) * spb, invig: defaultInvig });
                }
            }
        }

        // ── Try Pattern: Section letters (AMET) ──
        // "section A - 8, Section B &C - 12"
        if (specs.length === 0) {
            const letterPattern = /section\s*([A-Z])\s*(?:[&,]\s*([A-Z]))?\s*[-–—:]+\s*(\d+)/gi;
            const letterMatches = [...colC.matchAll(letterPattern)];
            if (letterMatches.length >= 1) {
                for (const m of letterMatches) {
                    const benchCount = parseInt(m[3]) || 0;
                    if (benchCount > 0) {
                        specs.push({ name: `Section ${m[1]}`, benches: benchCount, spb, capacity: benchCount * spb, invig: defaultInvig });
                        if (m[2]) {
                            specs.push({ name: `Section ${m[2]}`, benches: benchCount, spb, capacity: benchCount * spb, invig: defaultInvig });
                        }
                    }
                }
            }
        }

        // ── Try Pattern: Parenthetical types ──
        // "24 (small class room)\n48 (large class room)" or "32(sec-3),28(sec-2),28(sec-1)"
        if (specs.length === 0) {
            const parenPattern = /(\d+)\s*\(\s*([^)]+)\s*\)/g;
            const parenMatches = [...colC.matchAll(parenPattern)];
            if (parenMatches.length >= 2) {
                const types = parenMatches.map(m => ({ benches: parseInt(m[1]), label: m[2].trim() }));
                if (types.length === classroomCount) {
                    // Each type = one room (NRI: 3 types, 3 rooms)
                    for (const t of types) {
                        specs.push({ name: t.label, benches: t.benches, spb, capacity: t.benches * spb, invig: defaultInvig });
                    }
                } else {
                    // Fewer types than rooms → distribute (Annamacharya: 2 types, 4 rooms)
                    const perType = Math.ceil(classroomCount / types.length);
                    let count = 0;
                    for (const t of types) {
                        const n = Math.min(perType, classroomCount - count);
                        for (let j = 0; j < n; j++) {
                            specs.push({ name: `${t.label} ${n > 1 ? j + 1 : ''}`.trim(), benches: t.benches, spb, capacity: t.benches * spb, invig: defaultInvig });
                            count++;
                        }
                    }
                }
            }
        }

        // ── Try Pattern: Multi-line bench types (MRV: "21 big\n2 small") ──
        if (specs.length === 0) {
            const lines = colC.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
            const isMinMax = /\b(min|max|minimum|maximum)\b/i.test(colC);
            const typedLines = lines.filter(l => /^\d+\s+\S/.test(l));

            if (typedLines.length >= 2 && !isMinMax) {
                // "21 big\n2 small" → mixed bench types in each room
                const benchTypes = typedLines.map(l => {
                    const m = l.match(/^(\d+)\s+(.+)/);
                    return m ? { benches: parseInt(m[1]), label: m[2].trim() } : null;
                }).filter(Boolean) as { benches: number; label: string }[];

                const totalPerRoom = benchTypes.reduce((s, t) => s + t.benches, 0);
                const capFromE = getFirstNumber(colE);

                // All rooms are identical (MRV: 5 rooms, each with 21 big + 2 small = 23 benches)
                for (let i = 0; i < classroomCount; i++) {
                    specs.push({
                        name: `Classroom ${i + 1}`,
                        benches: totalPerRoom,
                        spb,
                        capacity: capFromE || totalPerRoom * spb,
                        invig: defaultInvig
                    });
                }
            }
        }

        // ── Pattern: Simple number(s) ──
        if (specs.length === 0) {
            let benchNums = getAllNumbers(colC);
            if (benchNums.length === 0) benchNums = [30];

            const isMinMax = /\b(min|max|minimum|maximum)\b/i.test(colC);
            const capPerRoom = getFirstNumber(colE);

            // Range like "minimum 24 max 35" → average
            if (isMinMax && benchNums.length === 2) {
                benchNums = [Math.round((benchNums[0] + benchNums[1]) / 2)];
            }

            // "21 students, and in some classes 28" → [21, 28], alternate
            // "35 & 40" → [35, 40], alternate
            // "160" single number → check if total vs per-room
            if (benchNums.length === 1 && classroomCount > 1) {
                const num = benchNums[0];
                // Check: is this per-room or total?
                // Per-room: num * spb ≈ capPerRoom (within 20%)
                // Total: (num / count) * spb ≈ capPerRoom
                if (capPerRoom > 0) {
                    let perRoomOk = false;
                    for (let trySpb = 1; trySpb <= 6; trySpb++) {
                        if (Math.abs(num * trySpb - capPerRoom) <= capPerRoom * 0.25) { perRoomOk = true; break; }
                    }
                    if (!perRoomOk) {
                        const divided = Math.ceil(num / classroomCount);
                        let dividedOk = false;
                        for (let trySpb = 1; trySpb <= 6; trySpb++) {
                            if (Math.abs(divided * trySpb - capPerRoom) <= capPerRoom * 0.25) { dividedOk = true; break; }
                        }
                        if (dividedOk) benchNums[0] = divided;
                    }
                } else if (!/\beach\b|\bper\b|\bclassroom\b|\broom\b/i.test(colC) && num > classroomCount * 20) {
                    // No capacity to check, number is suspiciously large → probably total
                    benchNums[0] = Math.ceil(num / classroomCount);
                }
            }

            for (let i = 0; i < classroomCount; i++) {
                const b = benchNums[i % benchNums.length] || benchNums[0];
                specs.push({
                    name: `Classroom ${i + 1}`,
                    benches: b,
                    spb,
                    capacity: b * spb,
                    invig: defaultInvig
                });
            }
        }

        // ── Apply capacity from E (ground truth) ──
        // Split by newline AND comma (for "section A - 29, Section B & C - 48")
        const capSegments = colE.split(/[\n\r]+/).flatMap(l => {
            // Split by comma only if it separates named sections (not random commas in text)
            if (/section|classroom|hall|room/i.test(l) && l.includes(',')) {
                return l.split(/,(?=\s*(?:section|classroom|hall|room))/i);
            }
            return [l];
        }).map(l => l.trim()).filter(l => l);
        let capValues: number[] = [];

        // Check for named caps: "86(sec-3)", "Classroom 1 – 41", "section A - 29"
        const hasNamedCaps = capSegments.some(l =>
            /(?:classroom|hall|section|room|block)\s*[-.]?\s*(?:\d+|[A-Z])/i.test(l) ||
            /\d+\s*\(/.test(l)
        );

        if (hasNamedCaps) {
            for (const line of capSegments) {
                const pm = line.match(/(\d+)\s*\(/);
                if (pm) { capValues.push(parseInt(pm[1])); continue; }
                const compound = line.match(/section\s*([A-Z])\s*[&,]\s*([A-Z])\s*[-–—:]+\s*(\d+)/i);
                if (compound) { capValues.push(parseInt(compound[3])); capValues.push(parseInt(compound[3])); continue; }
                const nm = line.match(/[-–—:\s]\s*(\d+)\s*$/);
                if (nm) { capValues.push(parseInt(nm[1])); continue; }
                const nums = getAllNumbers(line);
                if (nums.length > 0) capValues.push(nums[nums.length - 1]);
            }
        } else {
            capValues = getAllNumbers(colE);
            if (capValues.length === 2 && /\d+\s*[-–—to]+\s*\d+/i.test(colE)) {
                capValues = [Math.round((capValues[0] + capValues[1]) / 2)];
            }
            // Filter out noise numbers from descriptive text
            if (capValues.length > specs.length && capValues.some(v => v < 10)) {
                capValues = capValues.filter(v => v >= 10);
            }
        }

        // Apply capacity — E column overrides computed values
        const eWords = colE.split(/\s+/).filter(w => w.length > 0).length;
        const eIsDescriptive = eWords > 15 && capValues.length > specs.length;
        const dIsClear = rawSpb >= 1 && rawSpb <= 6;

        if (capValues.length > 0 && !eIsDescriptive) {
            for (let i = 0; i < specs.length; i++) {
                const cap = capValues.length >= specs.length
                    ? capValues[i]
                    : capValues.length === 1 ? capValues[0]
                    : capValues[i % capValues.length];
                if (cap && cap > 0) {
                    specs[i].capacity = cap;
                    const computed = specs[i].benches * specs[i].spb;
                    if (Math.abs(computed - cap) > cap * 0.15 && specs[i].benches > 0) {
                        if (dIsClear) {
                            specs[i].benches = Math.ceil(cap / specs[i].spb);
                        } else {
                            const inferred = Math.round(cap / specs[i].benches);
                            if (inferred >= 1 && inferred <= 6 && Math.abs(specs[i].benches * inferred - cap) <= cap * 0.15) {
                                specs[i].spb = inferred;
                            } else {
                                specs[i].benches = Math.ceil(cap / specs[i].spb);
                            }
                        }
                    }
                }
            }
        }

        // ── Cross-validate with total capacity F ──
        const totalCap = getFirstNumber(colF);
        if (totalCap > 0 && specs.length > 0) {
            const sumCap = specs.reduce((s, sp) => s + sp.capacity, 0);
            if (Math.abs(sumCap - totalCap) > totalCap * 0.2 && sumCap > 0) {
                const ratio = totalCap / sumCap;
                for (const spec of specs) {
                    spec.capacity = Math.round(spec.capacity * ratio);
                    if (spec.spb > 0) spec.benches = Math.ceil(spec.capacity / spec.spb);
                }
            }
        }

        // ── Parse per-room invigilators from G ──
        const invigLines = colG.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        const namedInvigPattern = /(?:section|hall|classroom|room|lab)\s*[-.\s]?\s*(?:\d+|[A-Z])\s*[-–—:\s]+\s*(\d+)/gi;
        const hasNamedInvig = invigLines.some(l => namedInvigPattern.test(l));
        namedInvigPattern.lastIndex = 0;

        if (hasNamedInvig && invigLines.length >= specs.length) {
            const invigPerRoom: number[] = [];
            for (const line of invigLines) {
                const nums = getAllNumbers(line);
                if (nums.length > 0) invigPerRoom.push(nums[nums.length - 1]);
            }
            for (let i = 0; i < specs.length; i++) {
                specs[i].invig = Math.max(1, invigPerRoom[i] || defaultInvig);
            }
        }

        // ── Ensure no zero values ──
        for (const spec of specs) {
            if (spec.benches <= 0) spec.benches = 20;
            if (spec.capacity <= 0) spec.capacity = spec.benches * spec.spb;
        }

        // ── Emit classrooms ──
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            parsed.push({
                university_name: uniName,
                name: `${uniName} - ${spec.name}`,
                code: `${uniName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '')}-R${r}-${i + 1}`,
                room_type: spec.benches >= 40 ? 'HALL' : spec.benches <= 5 ? 'LAB' : 'LECTURE',
                total_benches: spec.benches,
                seats_per_bench: spec.spb,
                capacity: spec.capacity,
                invigilators_required: spec.invig,
                remarks: colI
            });
        }

        debug.push({
            row: r + 1,
            university: uniName,
            classrooms_parsed: specs.length,
            specs: specs.map(s => ({ name: s.name, benches: s.benches, spb: s.spb, cap: s.capacity, invig: s.invig })),
            raw: { colB, colC: colC.substring(0, 100), colD, colE: colE.substring(0, 100), classroomCount }
        });
    }

    return { classrooms: parsed, debug };
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const t0 = Date.now();
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const targetUniversityId = formData.get('universityId') as string;

        if (!file) throw error(400, 'No file uploaded');

        const buffer = await file.arrayBuffer();
        const { classrooms: parsed, debug } = parseExcelClassrooms(buffer);
        console.log(`[import ${PARSER_VERSION}] parsed ${parsed.length} classrooms from ${parsed.map(p => p.university_name).filter((v, i, a) => a.indexOf(v) === i).length} universities`);

        if (parsed.length === 0) {
            return json({ error: 'No classrooms found', debug, parser_version: PARSER_VERSION }, { status: 400 });
        }

        // Schema migration
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

        // Fetch universities + campuses
        const [uniResult, campusResult] = await Promise.all([
            db.query(`SELECT id, name FROM universities`),
            db.query(`SELECT id, university_id FROM campuses`)
        ]);

        // Build university name → id map
        const uniMap = new Map<string, string>();
        const uniNames: { name: string; id: string }[] = [];
        for (const u of uniResult.rows) {
            const nameUp = u.name.toUpperCase().trim();
            uniMap.set(nameUp, u.id);
            uniNames.push({ name: nameUp, id: u.id });
            for (const w of nameUp.split(/\s+/)) {
                if (w.length >= 2 && !['OF', 'THE', 'AND', 'FOR', 'IN', 'AT', 'TO', 'BY', 'IS', 'IT', 'OR', 'AN'].includes(w)) {
                    uniMap.set(w, u.id);
                }
            }
            const initials = nameUp.split(/\s+/).filter((w: string) => !['OF', 'THE', 'AND', 'FOR', 'IN', 'AT', 'TO', 'BY', 'IS', 'IT', 'OR', 'AN', 'UNIVERSITY', '&'].includes(w)).map((w: string) => w[0]).join('');
            if (initials.length >= 2) uniMap.set(initials, u.id);
        }

        // Known abbreviation aliases
        for (const u of uniResult.rows) {
            const nameUp = u.name.toUpperCase().trim();
            if (nameUp.includes('PATIL')) uniMap.set('ADYPU', u.id);
            if (nameUp.includes('MARITIME') || nameUp.includes('AMET')) uniMap.set('AMET', u.id);
            if (nameUp.includes('MALLAREDDY') || nameUp.includes('MALLA REDDY')) { uniMap.set('MRV', u.id); uniMap.set('MALLAREDDY', u.id); }
            if (nameUp.includes('CHEVELLA') || nameUp.includes('NIAT')) uniMap.set('CHEVELLA', u.id);
            if (nameUp.includes('CRESCENT')) uniMap.set('CRESCENT', u.id);
            if (nameUp.includes('NSRIT')) uniMap.set('NSRIT', u.id);
            if (nameUp.includes('NRI')) uniMap.set('NRI', u.id);
            if (nameUp.includes('CHALAPATHI') || nameUp === 'CRM') { uniMap.set('CHALAPATHI', u.id); uniMap.set('CRM', u.id); }
            if (nameUp.includes('CDU')) uniMap.set('CDU', u.id);
            if (nameUp.includes('GHODAWAT')) { uniMap.set('SGU', u.id); uniMap.set('SANJAY GHODAWAT', u.id); }
            if (nameUp.includes('VYASA') || nameUp.includes('S-VYASA')) uniMap.set('SVYASA', u.id);
            if (nameUp.includes('YENEPOYA')) uniMap.set('YENEPOYA', u.id);
            if (nameUp.includes('NOIDA')) uniMap.set('NIU', u.id);
            if (nameUp.includes('VGU')) uniMap.set('VGU', u.id);
            if (nameUp.includes('TAKSHASHILA')) uniMap.set('TAKSHASHILA', u.id);
            if (nameUp.includes('ANNAMACHARYA')) uniMap.set('ANNAMACHARYA', u.id);
            if (nameUp.includes('AURORA')) uniMap.set('AURORA', u.id);
        }

        // Campus map
        const campusMap = new Map<string, string>();
        for (const c of campusResult.rows) {
            if (!campusMap.has(c.university_id)) campusMap.set(c.university_id, c.id);
        }

        // Resolve universities
        function resolveUniversityId(sheetName: string): string {
            const nameUp = sheetName.toUpperCase().trim();
            const normalized = nameUp.replace(/\s*(UNIVERSITY|INSTITUTE|COLLEGE|OF TECHNOLOGY|DEEMED)\s*/g, '').trim();
            let id = uniMap.get(nameUp) || uniMap.get(normalized) || '';
            if (!id) {
                for (const [key, uid] of uniMap) {
                    if (nameUp.includes(key) || key.includes(nameUp) || normalized.includes(key) || key.includes(normalized)) {
                        id = uid; break;
                    }
                }
            }
            if (!id) {
                const words = nameUp.split(/\s+/).filter(w => w.length >= 2);
                for (const { name: dbName, id: uid } of uniNames) {
                    const dbWords = dbName.split(/\s+/);
                    if (words.some(sw => dbWords.some(dw => sw === dw || sw.includes(dw) || dw.includes(sw)))) {
                        id = uid; break;
                    }
                }
            }
            return id;
        }

        const skipped: any[] = [];
        const resolved: { classroom: any; uniId: string }[] = [];
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

        // Create missing campuses
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

        // DELETE existing classrooms for these universities (prevent accumulation)
        const resolvedUniIds = [...new Set(resolved.map(r => r.uniId))];
        if (resolvedUniIds.length > 0) {
            const delPh = resolvedUniIds.map((_, i) => `$${i + 1}`).join(', ');
            const delResult = await db.query(`DELETE FROM classrooms WHERE university_id IN (${delPh})`, resolvedUniIds);
            console.log(`[import ${PARSER_VERSION}] deleted ${delResult.rowCount} old classrooms for ${resolvedUniIds.length} universities`);
        }

        // Build insert list
        const toCreate: any[] = [];
        for (const { classroom, uniId } of resolved) {
            const campusId = campusMap.get(uniId);
            if (!campusId) { skipped.push({ ...classroom, reason: 'No campus' }); continue; }
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
        let created: any[] = [];
        if (toCreate.length > 0) {
            try {
                const results = await directBatchInsert(toCreate);
                created = results.map((room, i) => ({ ...room, university_name: toCreate[i]?.university_name }));
            } catch (e: any) {
                console.error(`[import ${PARSER_VERSION}] batch insert failed, trying smaller batches:`, e.message);
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

        console.log(`[import ${PARSER_VERSION}] DONE: created=${created.length}, skipped=${skipped.length}, total_time=${Date.now() - t0}ms`);

        return json({
            created: created.length,
            skipped: skipped.length,
            classrooms: created,
            skippedDetails: skipped,
            debug,
            parser_version: PARSER_VERSION
        }, { status: 201 });
    }

    // Legacy JSON import
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
