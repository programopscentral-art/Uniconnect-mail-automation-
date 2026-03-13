import { db } from '../db/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface APDPlanRow {
    university_name?: string;
    start_date?: string;
    end_date?: string;
    working_days_per_week?: number;
    total_working_days?: number;
    saturdays_off?: string;
    non_working_saturdays?: string[];
    public_holidays?: { date: string; name: string }[];
    slots_per_day?: number;
    slot_duration_minutes?: number;
    total_university_working_days?: number;
    university_assessment_days?: number;
    niat_working_days?: number;
    total_niat_slots?: number;
    niat_assessment_slots?: number;
    net_executional_slots?: number;
    buffer_slots?: number;
    pm_signoff?: boolean;
    boa_signoff?: boolean;
    remarks?: string;
    subjects?: APDSubjectRow[];
}

export interface APDSubjectRow {
    subject_code: string;
    subject_name: string;
    total_slots_required: number;
    slots_per_week: number;
    buffer_slots?: number;
    lab_slots_required?: number;
    lab_slots_per_week?: number;
    priority?: number;
    remarks?: string;
}

export interface APDParseResult {
    plans: APDPlanRow[];
    errors: { row: number; field: string; message: string }[];
    warnings: string[];
    totalRows: number;
}

export interface APDPlanRecord {
    id: string;
    university_id: string;
    term_id: string | null;
    program_id: string | null;
    start_date: string | null;
    end_date: string | null;
    working_days_per_week: number;
    total_working_days: number | null;
    saturdays_off: string;
    slots_per_day: number;
    net_executional_slots: number | null;
    buffer_slots: number;
    plan_status: string;
    remarks: string | null;
    created_at: string;
    subject_requirements?: APDSubjectRequirement[];
}

export interface APDSubjectRequirement {
    id: string;
    apd_plan_id: string;
    subject_id: string | null;
    subject_code: string;
    subject_name: string;
    total_slots_required: number;
    slots_per_week: number;
    buffer_slots: number;
    lab_slots_required: number;
    lab_slots_per_week: number;
    slots_allocated: number;
    slots_remaining: number;
    priority: number;
}

// ─── Auto-migration ──────────────────────────────────────────────────────────

let _migrated = false;
async function ensureAPDTables() {
    if (_migrated) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS apd_import_batches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL,
                file_size_bytes INTEGER,
                row_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                import_status TEXT DEFAULT 'PENDING',
                error_details JSONB DEFAULT '[]'::jsonb,
                uploaded_by UUID REFERENCES users(id),
                uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                processed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS apd_university_plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                import_batch_id UUID REFERENCES apd_import_batches(id) ON DELETE SET NULL,
                term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
                program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
                start_date DATE, end_date DATE,
                working_days_per_week INTEGER DEFAULT 5,
                total_working_days INTEGER,
                saturdays_off TEXT DEFAULT 'ALL',
                non_working_saturdays JSONB DEFAULT '[]'::jsonb,
                public_holidays JSONB DEFAULT '[]'::jsonb,
                slots_per_day INTEGER DEFAULT 7,
                slot_duration_minutes INTEGER DEFAULT 50,
                total_university_working_days INTEGER,
                university_assessment_days INTEGER DEFAULT 0,
                niat_working_days INTEGER,
                total_niat_slots INTEGER,
                niat_assessment_slots INTEGER DEFAULT 0,
                net_executional_slots INTEGER,
                buffer_slots INTEGER DEFAULT 0,
                pm_signoff BOOLEAN DEFAULT FALSE,
                boa_signoff BOOLEAN DEFAULT FALSE,
                remarks TEXT,
                plan_status TEXT DEFAULT 'DRAFT',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                created_by UUID REFERENCES users(id),
                updated_by UUID REFERENCES users(id)
            )
        `);
        // Add unique constraint if not exists (safe for re-runs)
        await db.query(`
            DO $$ BEGIN
                ALTER TABLE apd_university_plans ADD CONSTRAINT apd_plans_uni_term_prog_uq
                    UNIQUE(university_id, term_id, program_id);
            EXCEPTION WHEN duplicate_table THEN NULL;
                      WHEN duplicate_object THEN NULL;
            END $$;
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS apd_subject_slot_requirements (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                apd_plan_id UUID NOT NULL REFERENCES apd_university_plans(id) ON DELETE CASCADE,
                subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
                subject_code TEXT,
                subject_name TEXT,
                total_slots_required INTEGER NOT NULL DEFAULT 0,
                slots_per_week INTEGER NOT NULL DEFAULT 0,
                buffer_slots INTEGER DEFAULT 0,
                lab_slots_required INTEGER DEFAULT 0,
                lab_slots_per_week INTEGER DEFAULT 0,
                slots_allocated INTEGER DEFAULT 0,
                priority INTEGER DEFAULT 1,
                remarks TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS scheduling_constraints (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                constraint_type TEXT NOT NULL,
                constraint_scope TEXT DEFAULT 'UNIVERSITY',
                scope_entity_id UUID,
                constraint_value JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                created_by UUID REFERENCES users(id)
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_weeks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                apd_plan_id UUID REFERENCES apd_university_plans(id) ON DELETE SET NULL,
                timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                week_start DATE NOT NULL,
                week_end DATE NOT NULL,
                week_number INTEGER,
                week_status TEXT DEFAULT 'DRAFT',
                generation_source TEXT DEFAULT 'IMPORT',
                cloned_from_week_id UUID,
                published_at TIMESTAMPTZ,
                published_by UUID REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_import_batches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                timetable_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                timetable_week_id UUID REFERENCES timetable_weeks(id) ON DELETE SET NULL,
                file_name TEXT NOT NULL,
                file_size_bytes INTEGER,
                total_rows_parsed INTEGER DEFAULT 0,
                rows_matched INTEGER DEFAULT 0,
                rows_failed INTEGER DEFAULT 0,
                error_details JSONB DEFAULT '[]'::jsonb,
                import_status TEXT DEFAULT 'PENDING',
                uploaded_by UUID REFERENCES users(id),
                uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                processed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS timetable_change_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
                from_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                to_version_id UUID REFERENCES timetable_versions(id) ON DELETE SET NULL,
                timetable_week_id UUID REFERENCES timetable_weeks(id) ON DELETE SET NULL,
                change_type TEXT NOT NULL,
                session_id UUID REFERENCES timetable_sessions(id) ON DELETE SET NULL,
                old_values JSONB DEFAULT '{}'::jsonb,
                new_values JSONB DEFAULT '{}'::jsonb,
                change_reason TEXT,
                changed_by UUID REFERENCES users(id),
                changed_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        _migrated = true;
    } catch { _migrated = true; }
}

// ─── APD Parser ──────────────────────────────────────────────────────────────

/**
 * Parse an APD Excel file.
 * Expected format:
 * - "Planning" sheet with university plan rows (one row per university or one sheet = one plan)
 * - "Subjects" sheet (or subject columns in the same sheet) with per-subject slot requirements
 *
 * The parser is flexible — it detects column headers by name matching.
 */
export async function parseAPDExcel(buffer: Buffer): Promise<APDParseResult> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const result: APDParseResult = { plans: [], errors: [], warnings: [], totalRows: 0 };

    // Find the planning sheet (flexible name matching)
    const planSheetName = workbook.SheetNames.find(n =>
        /plan|apd|schedule|overview|summary/i.test(n)
    ) || workbook.SheetNames[0];

    if (!planSheetName) {
        result.errors.push({ row: 0, field: '', message: 'No sheets found in the file' });
        return result;
    }

    const planSheet = workbook.Sheets[planSheetName];
    const planRows: any[][] = XLSX.utils.sheet_to_json(planSheet, { header: 1, defval: '' });

    if (planRows.length < 2) {
        result.errors.push({ row: 0, field: '', message: 'Planning sheet has no data rows' });
        return result;
    }

    // Detect column mapping from header row
    const headerRow = planRows[0].map((h: any) => String(h).toLowerCase().trim());
    const colMap = buildColumnMap(headerRow);

    // Parse data rows
    for (let i = 1; i < planRows.length; i++) {
        const row = planRows[i];
        if (!row || row.every((c: any) => !c && c !== 0)) continue;
        result.totalRows++;

        const plan: APDPlanRow = {};
        const rowNum = i + 1;

        // Extract fields using column map
        plan.university_name = getStr(row, colMap.university_name);
        plan.start_date = parseExcelDate(row[colMap.start_date ?? -1]);
        plan.end_date = parseExcelDate(row[colMap.end_date ?? -1]);
        plan.working_days_per_week = getNum(row, colMap.working_days_per_week);
        plan.total_working_days = getNum(row, colMap.total_working_days);
        plan.saturdays_off = getStr(row, colMap.saturdays_off) || 'ALL';
        plan.slots_per_day = getNum(row, colMap.slots_per_day);
        plan.slot_duration_minutes = getNum(row, colMap.slot_duration_minutes);
        plan.total_university_working_days = getNum(row, colMap.total_university_working_days);
        plan.university_assessment_days = getNum(row, colMap.university_assessment_days);
        plan.niat_working_days = getNum(row, colMap.niat_working_days);
        plan.total_niat_slots = getNum(row, colMap.total_niat_slots);
        plan.niat_assessment_slots = getNum(row, colMap.niat_assessment_slots);
        plan.net_executional_slots = getNum(row, colMap.net_executional_slots);
        plan.buffer_slots = getNum(row, colMap.buffer_slots);
        plan.remarks = getStr(row, colMap.remarks);

        // Parse signoff booleans
        const pmVal = getStr(row, colMap.pm_signoff)?.toLowerCase();
        plan.pm_signoff = pmVal === 'yes' || pmVal === 'true' || pmVal === '1';
        const boaVal = getStr(row, colMap.boa_signoff)?.toLowerCase();
        plan.boa_signoff = boaVal === 'yes' || boaVal === 'true' || boaVal === '1';

        // Parse holidays if present as a column
        const holidayStr = getStr(row, colMap.public_holidays);
        if (holidayStr) {
            plan.public_holidays = parseHolidayString(holidayStr);
        }

        // Validate required fields
        if (!plan.start_date && !plan.end_date && !plan.total_working_days) {
            result.errors.push({ row: rowNum, field: 'start_date', message: 'Row has no date or working day information' });
            continue;
        }

        result.plans.push(plan);
    }

    // Check for a Subjects sheet
    const subjectSheetName = workbook.SheetNames.find(n =>
        /subject|slot|requirement|allocation|distribution/i.test(n)
    );

    if (subjectSheetName && subjectSheetName !== planSheetName) {
        const subjectSheet = workbook.Sheets[subjectSheetName];
        const subjectRows: any[][] = XLSX.utils.sheet_to_json(subjectSheet, { header: 1, defval: '' });

        if (subjectRows.length >= 2) {
            const subHeader = subjectRows[0].map((h: any) => String(h).toLowerCase().trim());
            const subColMap = buildSubjectColumnMap(subHeader);
            const subjects: APDSubjectRow[] = [];

            for (let i = 1; i < subjectRows.length; i++) {
                const row = subjectRows[i];
                if (!row || row.every((c: any) => !c && c !== 0)) continue;

                const code = getStr(row, subColMap.code);
                const name = getStr(row, subColMap.name);
                if (!code && !name) continue;

                subjects.push({
                    subject_code: code || '',
                    subject_name: name || '',
                    total_slots_required: getNum(row, subColMap.total_slots) || 0,
                    slots_per_week: getNum(row, subColMap.slots_per_week) || 0,
                    buffer_slots: getNum(row, subColMap.buffer_slots) || 0,
                    lab_slots_required: getNum(row, subColMap.lab_slots) || 0,
                    lab_slots_per_week: getNum(row, subColMap.lab_per_week) || 0,
                    priority: getNum(row, subColMap.priority) || 1,
                    remarks: getStr(row, subColMap.remarks),
                });
            }

            // Attach subjects to all plans (or first plan if single)
            for (const plan of result.plans) {
                plan.subjects = subjects;
            }

            if (subjects.length === 0) {
                result.warnings.push('Subjects sheet found but no valid subject rows detected');
            }
        }
    } else if (!subjectSheetName) {
        result.warnings.push('No separate Subjects sheet found — subject slot requirements should be added manually');
    }

    if (result.plans.length === 0 && result.errors.length === 0) {
        result.warnings.push('No valid plan rows found in the file');
    }

    return result;
}

// ─── Column mapping helpers ──────────────────────────────────────────────────

function buildColumnMap(headers: string[]): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;

        if (/universit|college|institution/i.test(h)) map.university_name = i;
        else if (/start.?date|from.?date|begin/i.test(h)) map.start_date = i;
        else if (/end.?date|to.?date/i.test(h)) map.end_date = i;
        else if (/working.?days.?per.?week/i.test(h)) map.working_days_per_week = i;
        else if (/total.?working.?day/i.test(h)) map.total_working_days = i;
        else if (/saturday/i.test(h)) map.saturdays_off = i;
        else if (/slot.?per.?day|slots.?day/i.test(h)) map.slots_per_day = i;
        else if (/slot.?duration|duration/i.test(h)) map.slot_duration_minutes = i;
        else if (/total.*university.*working|university.*total.*working/i.test(h)) map.total_university_working_days = i;
        else if (/assessment.?day/i.test(h)) map.university_assessment_days = i;
        else if (/niat.?working/i.test(h)) map.niat_working_days = i;
        else if (/total.?niat.?slot/i.test(h)) map.total_niat_slots = i;
        else if (/niat.?assessment/i.test(h)) map.niat_assessment_slots = i;
        else if (/net.?exec|executional/i.test(h)) map.net_executional_slots = i;
        else if (/buffer/i.test(h)) map.buffer_slots = i;
        else if (/pm.?sign|pm.?signoff/i.test(h)) map.pm_signoff = i;
        else if (/boa.?sign|boa/i.test(h)) map.boa_signoff = i;
        else if (/holiday/i.test(h)) map.public_holidays = i;
        else if (/remark|note|comment/i.test(h)) map.remarks = i;
    }
    return map;
}

function buildSubjectColumnMap(headers: string[]): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;

        if (/^code$|subject.?code|sub.?code/i.test(h)) map.code = i;
        else if (/^name$|subject.?name|sub.?name/i.test(h)) map.name = i;
        else if (/total.?slot|total.?session/i.test(h)) map.total_slots = i;
        else if (/slot.?per.?week|per.?week|weekly/i.test(h)) map.slots_per_week = i;
        else if (/buffer/i.test(h)) map.buffer_slots = i;
        else if (/lab.?slot|lab.?total|total.?lab/i.test(h)) map.lab_slots = i;
        else if (/lab.?per.?week|lab.?weekly/i.test(h)) map.lab_per_week = i;
        else if (/priority/i.test(h)) map.priority = i;
        else if (/remark|note/i.test(h)) map.remarks = i;
    }
    return map;
}

function getStr(row: any[], idx: number | undefined): string {
    if (idx === undefined || idx < 0 || idx >= row.length) return '';
    return String(row[idx] ?? '').trim();
}

function getNum(row: any[], idx: number | undefined): number | undefined {
    if (idx === undefined || idx < 0 || idx >= row.length) return undefined;
    const val = row[idx];
    if (val === '' || val === null || val === undefined) return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
}

function parseExcelDate(val: any): string | undefined {
    if (!val) return undefined;
    // If it's a JS Date (from xlsx serial-to-date conversion)
    if (val instanceof Date) return val.toISOString().split('T')[0];
    // If it's a number (Excel serial date)
    if (typeof val === 'number' && val > 40000) {
        const d = new Date((val - 25569) * 86400 * 1000);
        return d.toISOString().split('T')[0];
    }
    // String date
    const str = String(val).trim();
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return undefined;
}

function parseHolidayString(str: string): { date: string; name: string }[] {
    // Format: "Jan 26 - Republic Day, Aug 15 - Independence Day" or JSON
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
    } catch {}

    const holidays: { date: string; name: string }[] = [];
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        const [datePart, ...nameParts] = part.split('-').map(s => s.trim());
        if (datePart) {
            holidays.push({
                date: datePart,
                name: nameParts.join('-').trim() || datePart
            });
        }
    }
    return holidays;
}

// ─── APD Planning Service ────────────────────────────────────────────────────

export class APDPlanningService {

    /**
     * Create an import batch record.
     */
    static async createImportBatch(universityId: string, fileName: string, fileSizeBytes: number, uploadedBy: string) {
        await ensureAPDTables();
        const res = await db.query(
            `INSERT INTO apd_import_batches (university_id, file_name, file_size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [universityId, fileName, fileSizeBytes, uploadedBy]
        );
        return res.rows[0];
    }

    /**
     * Update import batch status.
     */
    static async updateImportBatch(batchId: string, updates: {
        import_status: string; row_count?: number; error_count?: number; error_details?: any[];
    }) {
        await ensureAPDTables();
        await db.query(
            `UPDATE apd_import_batches SET
                import_status = $2, row_count = COALESCE($3, row_count),
                error_count = COALESCE($4, error_count), error_details = COALESCE($5, error_details),
                processed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [batchId, updates.import_status, updates.row_count ?? null,
             updates.error_count ?? null, updates.error_details ? JSON.stringify(updates.error_details) : null]
        );
    }

    /**
     * Save a parsed APD plan to the database.
     */
    static async savePlan(
        universityId: string,
        plan: APDPlanRow,
        opts: { importBatchId?: string; termId?: string; programId?: string; createdBy?: string }
    ): Promise<APDPlanRecord> {
        await ensureAPDTables();

        const res = await db.query(
            `INSERT INTO apd_university_plans (
                university_id, import_batch_id, term_id, program_id,
                start_date, end_date, working_days_per_week, total_working_days,
                saturdays_off, non_working_saturdays, public_holidays,
                slots_per_day, slot_duration_minutes,
                total_university_working_days, university_assessment_days,
                niat_working_days, total_niat_slots, niat_assessment_slots,
                net_executional_slots, buffer_slots,
                pm_signoff, boa_signoff, remarks, plan_status, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'DRAFT',$24)
            ON CONFLICT (university_id, term_id, program_id) DO UPDATE SET
                import_batch_id = EXCLUDED.import_batch_id,
                start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
                working_days_per_week = EXCLUDED.working_days_per_week,
                total_working_days = EXCLUDED.total_working_days,
                saturdays_off = EXCLUDED.saturdays_off,
                non_working_saturdays = EXCLUDED.non_working_saturdays,
                public_holidays = EXCLUDED.public_holidays,
                slots_per_day = EXCLUDED.slots_per_day,
                slot_duration_minutes = EXCLUDED.slot_duration_minutes,
                total_university_working_days = EXCLUDED.total_university_working_days,
                university_assessment_days = EXCLUDED.university_assessment_days,
                niat_working_days = EXCLUDED.niat_working_days,
                total_niat_slots = EXCLUDED.total_niat_slots,
                niat_assessment_slots = EXCLUDED.niat_assessment_slots,
                net_executional_slots = EXCLUDED.net_executional_slots,
                buffer_slots = EXCLUDED.buffer_slots,
                pm_signoff = EXCLUDED.pm_signoff, boa_signoff = EXCLUDED.boa_signoff,
                remarks = EXCLUDED.remarks, updated_at = NOW(), updated_by = $24
            RETURNING *`,
            [
                universityId, opts.importBatchId || null, opts.termId || null, opts.programId || null,
                plan.start_date || null, plan.end_date || null,
                plan.working_days_per_week ?? 5, plan.total_working_days ?? null,
                plan.saturdays_off || 'ALL',
                JSON.stringify(plan.non_working_saturdays || []),
                JSON.stringify(plan.public_holidays || []),
                plan.slots_per_day ?? 7, plan.slot_duration_minutes ?? 50,
                plan.total_university_working_days ?? null, plan.university_assessment_days ?? 0,
                plan.niat_working_days ?? null, plan.total_niat_slots ?? null,
                plan.niat_assessment_slots ?? 0, plan.net_executional_slots ?? null,
                plan.buffer_slots ?? 0, plan.pm_signoff ?? false, plan.boa_signoff ?? false,
                plan.remarks || null, opts.createdBy || null
            ]
        );
        const savedPlan = res.rows[0];

        // Save subject requirements
        if (plan.subjects && plan.subjects.length > 0) {
            await this.saveSubjectRequirements(savedPlan.id, universityId, plan.subjects);
        }

        return savedPlan;
    }

    /**
     * Save subject slot requirements for a plan.
     */
    static async saveSubjectRequirements(
        apdPlanId: string,
        universityId: string,
        subjects: APDSubjectRow[]
    ) {
        await ensureAPDTables();

        // Look up existing subjects by code for auto-linking
        const subjectsRes = await db.query(
            `SELECT id, code, name FROM subjects WHERE university_id = $1`,
            [universityId]
        );
        const subjectLookup = new Map<string, string>();
        for (const s of subjectsRes.rows) {
            if (s.code) subjectLookup.set(s.code.toUpperCase().trim(), s.id);
        }

        // Delete existing requirements for this plan (replace strategy)
        await db.query(`DELETE FROM apd_subject_slot_requirements WHERE apd_plan_id = $1`, [apdPlanId]);

        for (const subj of subjects) {
            const matchedId = subjectLookup.get(subj.subject_code.toUpperCase().trim()) || null;

            await db.query(
                `INSERT INTO apd_subject_slot_requirements (
                    apd_plan_id, subject_id, subject_code, subject_name,
                    total_slots_required, slots_per_week, buffer_slots,
                    lab_slots_required, lab_slots_per_week, priority, remarks
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    apdPlanId, matchedId, subj.subject_code, subj.subject_name,
                    subj.total_slots_required, subj.slots_per_week,
                    subj.buffer_slots ?? 0, subj.lab_slots_required ?? 0,
                    subj.lab_slots_per_week ?? 0, subj.priority ?? 1,
                    subj.remarks || null
                ]
            );
        }
    }

    /**
     * Get all APD plans for a university, optionally filtered by term.
     */
    static async getPlans(universityId: string, termId?: string): Promise<APDPlanRecord[]> {
        await ensureAPDTables();
        let query = `SELECT ap.*,
                        p.name as program_name, p.code as program_code,
                        t.name as term_name,
                        ib.file_name as import_file_name,
                        (SELECT COUNT(*) FROM apd_subject_slot_requirements sr WHERE sr.apd_plan_id = ap.id) as subject_count
                     FROM apd_university_plans ap
                     LEFT JOIN programs p ON ap.program_id = p.id
                     LEFT JOIN terms t ON ap.term_id = t.id
                     LEFT JOIN apd_import_batches ib ON ap.import_batch_id = ib.id
                     WHERE ap.university_id = $1`;
        const params: any[] = [universityId];
        if (termId) {
            query += ` AND ap.term_id = $2`;
            params.push(termId);
        }
        query += ` ORDER BY ap.created_at DESC`;
        const res = await db.query(query, params);
        return res.rows;
    }

    /**
     * Get a single APD plan with its subject requirements.
     */
    static async getPlanById(planId: string): Promise<APDPlanRecord | null> {
        await ensureAPDTables();
        const planRes = await db.query(
            `SELECT ap.*,
                    p.name as program_name, p.code as program_code,
                    t.name as term_name
             FROM apd_university_plans ap
             LEFT JOIN programs p ON ap.program_id = p.id
             LEFT JOIN terms t ON ap.term_id = t.id
             WHERE ap.id = $1`,
            [planId]
        );
        if (planRes.rows.length === 0) return null;

        const plan = planRes.rows[0];

        // Get subject requirements
        const subReqs = await db.query(
            `SELECT sr.*,
                    s.name as matched_subject_name, s.code as matched_subject_code
             FROM apd_subject_slot_requirements sr
             LEFT JOIN subjects s ON sr.subject_id = s.id
             WHERE sr.apd_plan_id = $1
             ORDER BY sr.priority, sr.subject_code`,
            [planId]
        );
        plan.subject_requirements = subReqs.rows;

        return plan;
    }

    /**
     * Update plan status (DRAFT → ACTIVE → ARCHIVED).
     */
    static async updatePlanStatus(planId: string, status: string, updatedBy: string) {
        await ensureAPDTables();
        await db.query(
            `UPDATE apd_university_plans SET plan_status = $2, updated_by = $3, updated_at = NOW() WHERE id = $1`,
            [planId, status, updatedBy]
        );
    }

    /**
     * Delete a plan and its subject requirements.
     */
    static async deletePlan(planId: string) {
        await ensureAPDTables();
        await db.query(`DELETE FROM apd_university_plans WHERE id = $1`, [planId]);
    }

    /**
     * Manually add/update a subject requirement.
     */
    static async upsertSubjectRequirement(apdPlanId: string, data: {
        subject_code: string; subject_name: string; subject_id?: string;
        total_slots_required: number; slots_per_week: number;
        buffer_slots?: number; lab_slots_required?: number; lab_slots_per_week?: number;
        priority?: number; remarks?: string;
    }) {
        await ensureAPDTables();
        const res = await db.query(
            `INSERT INTO apd_subject_slot_requirements (
                apd_plan_id, subject_id, subject_code, subject_name,
                total_slots_required, slots_per_week, buffer_slots,
                lab_slots_required, lab_slots_per_week, priority, remarks
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
            [
                apdPlanId, data.subject_id || null, data.subject_code, data.subject_name,
                data.total_slots_required, data.slots_per_week,
                data.buffer_slots ?? 0, data.lab_slots_required ?? 0,
                data.lab_slots_per_week ?? 0, data.priority ?? 1, data.remarks || null
            ]
        );
        return res.rows[0];
    }

    /**
     * Delete a subject requirement.
     */
    static async deleteSubjectRequirement(requirementId: string) {
        await ensureAPDTables();
        await db.query(`DELETE FROM apd_subject_slot_requirements WHERE id = $1`, [requirementId]);
    }

    /**
     * Get import history for a university.
     */
    static async getImportBatches(universityId: string) {
        await ensureAPDTables();
        const res = await db.query(
            `SELECT ib.*, u.name as uploaded_by_name
             FROM apd_import_batches ib
             LEFT JOIN users u ON ib.uploaded_by = u.id
             WHERE ib.university_id = $1
             ORDER BY ib.uploaded_at DESC`,
            [universityId]
        );
        return res.rows;
    }

    /**
     * Get scheduling constraints for a university.
     */
    static async getConstraints(universityId: string) {
        await ensureAPDTables();
        const res = await db.query(
            `SELECT * FROM scheduling_constraints WHERE university_id = $1 AND is_active = true ORDER BY constraint_type`,
            [universityId]
        );
        return res.rows;
    }

    /**
     * Save a scheduling constraint.
     */
    static async saveConstraint(universityId: string, data: {
        constraint_type: string; constraint_scope?: string; scope_entity_id?: string;
        constraint_value: any; created_by?: string;
    }) {
        await ensureAPDTables();
        const res = await db.query(
            `INSERT INTO scheduling_constraints (university_id, constraint_type, constraint_scope, scope_entity_id, constraint_value, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [universityId, data.constraint_type, data.constraint_scope || 'UNIVERSITY',
             data.scope_entity_id || null, JSON.stringify(data.constraint_value), data.created_by || null]
        );
        return res.rows[0];
    }
}
