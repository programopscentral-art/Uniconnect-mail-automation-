import { db } from './client';

// ─── Column Recognition Engine ──────────────────────────────────────
// Maps sheet column headers to known UniConnect data models.
// Returns mapping suggestions for import.

export type UniConnectTarget =
    | 'students'
    | 'attendance'
    | 'events'
    | 'tasks'
    | 'ops_daily'
    | 'budget'
    | 'communication'
    | 'custom';

export interface ColumnMapping {
    sheetHeader: string;
    colIndex: number;
    target: UniConnectTarget;
    targetField: string;
    confidence: number; // 0-1
    required: boolean;
}

export interface MappingSuggestion {
    target: UniConnectTarget;
    label: string;
    description: string;
    icon: string;
    matchedColumns: ColumnMapping[];
    unmatchedColumns: string[];
    requiredMissing: string[];
    confidence: number;
    canImport: boolean;
}

export interface AnalyzeResult {
    suggestions: MappingSuggestion[];
    unmappedHeaders: string[];
    totalColumns: number;
    totalRows: number;
}

// ─── Pattern definitions ────────────────────────────────────────────

interface FieldPattern {
    field: string;
    patterns: RegExp[];
    required: boolean;
}

const TARGET_FIELDS: Record<UniConnectTarget, { label: string; description: string; icon: string; fields: FieldPattern[] }> = {
    students: {
        label: 'Students',
        description: 'Import student records — names, emails, IDs, phone numbers',
        icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
        fields: [
            { field: 'name', patterns: [/^(student[_ ]?)?name$/i, /^full[_ ]?name$/i, /^student$/i, /^naam$/i, /^first[_ ]?name$/i], required: true },
            { field: 'email', patterns: [/^e?mail([_ ]?id)?$/i, /^student[_ ]?e?mail$/i, /^email[_ ]?address$/i], required: true },
            { field: 'external_id', patterns: [/^(roll|reg|registration|admission|enroll)[_ ]?(no|num|number|id)?$/i, /^external[_ ]?id$/i, /^id$/i, /^student[_ ]?id$/i, /^usn$/i, /^prn$/i], required: false },
            { field: 'phone', patterns: [/^(phone|mobile|contact|cell)[_ ]?(no|num|number)?$/i, /^whatsapp$/i], required: false },
            { field: 'program', patterns: [/^(program|programme|course|branch|dept|department)$/i], required: false },
            { field: 'section', patterns: [/^section$/i, /^div(ision)?$/i, /^batch$/i], required: false },
            { field: 'semester', patterns: [/^sem(ester)?$/i, /^year$/i], required: false },
            { field: 'parent_name', patterns: [/^(parent|father|mother|guardian)[_ ]?(name)?$/i], required: false },
            { field: 'parent_phone', patterns: [/^(parent|father|mother|guardian)[_ ]?(phone|mobile|contact|number)$/i], required: false },
            { field: 'parent_email', patterns: [/^(parent|father|mother|guardian)[_ ]?(e?mail)$/i], required: false },
            { field: 'address', patterns: [/^address$/i, /^city$/i, /^state$/i], required: false },
            { field: 'dob', patterns: [/^(dob|date[_ ]?of[_ ]?birth|birth[_ ]?date)$/i], required: false },
            { field: 'gender', patterns: [/^gender$/i, /^sex$/i], required: false },
        ]
    },
    attendance: {
        label: 'Attendance',
        description: 'Import attendance records — student, date, present/absent',
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
        fields: [
            { field: 'student_name', patterns: [/^(student[_ ]?)?name$/i, /^student$/i], required: true },
            { field: 'student_email', patterns: [/^e?mail([_ ]?id)?$/i, /^student[_ ]?e?mail$/i], required: false },
            { field: 'student_id', patterns: [/^(roll|reg|registration)[_ ]?(no|num|number|id)?$/i, /^student[_ ]?id$/i, /^usn$/i], required: false },
            { field: 'date', patterns: [/^date$/i, /^session[_ ]?date$/i, /^class[_ ]?date$/i, /^att(endance)?[_ ]?date$/i], required: true },
            { field: 'status', patterns: [/^(status|att(endance)?|present|p\/a)$/i, /^(present|absent)$/i], required: true },
            { field: 'subject', patterns: [/^(subject|course|class)$/i], required: false },
            { field: 'faculty', patterns: [/^(faculty|teacher|instructor|professor)$/i], required: false },
            { field: 'session_type', patterns: [/^(type|session[_ ]?type|class[_ ]?type)$/i, /^(lecture|lab|tutorial)$/i], required: false },
        ]
    },
    events: {
        label: 'Events',
        description: 'Import event schedules — title, dates, type, venue',
        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        fields: [
            { field: 'title', patterns: [/^(event[_ ]?)?(title|name)$/i, /^event$/i], required: true },
            { field: 'type', patterns: [/^(event[_ ]?)?type$/i, /^category$/i], required: false },
            { field: 'start_date', patterns: [/^(start[_ ]?)?date$/i, /^event[_ ]?date$/i, /^from$/i], required: true },
            { field: 'due_date', patterns: [/^(end|due|to)[_ ]?date$/i, /^to$/i], required: false },
            { field: 'description', patterns: [/^desc(ription)?$/i, /^details$/i, /^about$/i], required: false },
            { field: 'venue', patterns: [/^venue$/i, /^location$/i, /^place$/i], required: false },
            { field: 'priority', patterns: [/^priority$/i], required: false },
            { field: 'organizer', patterns: [/^(organiz|conduct)[a-z]*$/i, /^(coordinator|lead)$/i], required: false },
        ]
    },
    tasks: {
        label: 'Tasks',
        description: 'Import tasks — title, assignees, priority, due dates',
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
        fields: [
            { field: 'title', patterns: [/^(task[_ ]?)?(title|name)$/i, /^task$/i, /^todo$/i, /^action[_ ]?item$/i], required: true },
            { field: 'description', patterns: [/^desc(ription)?$/i, /^details$/i, /^notes$/i], required: false },
            { field: 'priority', patterns: [/^priority$/i, /^urgency$/i], required: false },
            { field: 'status', patterns: [/^status$/i, /^state$/i, /^progress$/i], required: false },
            { field: 'due_date', patterns: [/^(due|deadline|target)[_ ]?date$/i, /^due$/i, /^deadline$/i], required: false },
            { field: 'assigned_to', patterns: [/^assign(ed)?[_ ]?(to)?$/i, /^assignee$/i, /^owner$/i, /^responsible$/i], required: false },
            { field: 'start_date', patterns: [/^start[_ ]?date$/i, /^from$/i], required: false },
        ]
    },
    ops_daily: {
        label: 'Ops Daily Data',
        description: 'Import operational metrics — sessions, attendance, calls',
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
        fields: [
            { field: 'date', patterns: [/^date$/i, /^report[_ ]?date$/i], required: true },
            { field: 'university_name', patterns: [/^(university|college|campus|institution)[_ ]?(name)?$/i], required: true },
            { field: 'sessions_planned', patterns: [/^sessions?[_ ]?plan(ned)?$/i, /^planned[_ ]?sessions?$/i], required: false },
            { field: 'sessions_completed', patterns: [/^sessions?[_ ]?(completed?|done|conducted)$/i, /^(completed?|conducted)[_ ]?sessions?$/i], required: false },
            { field: 'sessions_cancelled', patterns: [/^sessions?[_ ]?cancel(led)?$/i, /^cancel(led)?[_ ]?sessions?$/i], required: false },
            { field: 'enrolled', patterns: [/^enrol(led|lment)?$/i, /^total[_ ]?students$/i], required: false },
            { field: 'attended', patterns: [/^attend(ed|ance)?$/i, /^present$/i, /^students[_ ]?attended$/i], required: false },
            { field: 'coach_calls', patterns: [/^coach[_ ]?calls?$/i], required: false },
            { field: 'parent_calls', patterns: [/^parent[_ ]?calls?$/i], required: false },
            { field: 'at_risk', patterns: [/^at[_ ]?risk$/i, /^risk[_ ]?students?$/i], required: false },
        ]
    },
    budget: {
        label: 'Budget / Expenses',
        description: 'Import budget items — categories, amounts, vendors',
        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        fields: [
            { field: 'description', patterns: [/^(item|description|expense|particular)s?$/i, /^desc$/i], required: true },
            { field: 'amount', patterns: [/^(amount|cost|price|total|value)$/i, /^(rs|inr|₹)$/i], required: true },
            { field: 'category', patterns: [/^category$/i, /^type$/i, /^head$/i, /^expense[_ ]?type$/i], required: false },
            { field: 'vendor', patterns: [/^vendor$/i, /^supplier$/i, /^payee$/i, /^paid[_ ]?to$/i], required: false },
            { field: 'date', patterns: [/^date$/i, /^expense[_ ]?date$/i, /^payment[_ ]?date$/i], required: false },
            { field: 'quantity', patterns: [/^(qty|quantity|units|count)$/i], required: false },
            { field: 'unit_cost', patterns: [/^(unit[_ ]?cost|rate|unit[_ ]?price)$/i], required: false },
            { field: 'invoice', patterns: [/^(invoice|bill|receipt)[_ ]?(no|number)?$/i], required: false },
            { field: 'status', patterns: [/^(payment[_ ]?)?status$/i, /^paid$/i], required: false },
        ]
    },
    communication: {
        label: 'Communication Tasks',
        description: 'Import message schedules — channels, times, content',
        icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        fields: [
            { field: 'message_title', patterns: [/^(message[_ ]?)?(title|subject)$/i, /^title$/i], required: true },
            { field: 'message_body', patterns: [/^(message|body|content|text)$/i], required: false },
            { field: 'channel', patterns: [/^channel$/i, /^platform$/i, /^(whatsapp|email|sms|app)$/i, /^medium$/i], required: false },
            { field: 'scheduled_at', patterns: [/^(scheduled?|send)[_ ]?(at|time|date)?$/i, /^time$/i, /^when$/i], required: false },
            { field: 'priority', patterns: [/^priority$/i], required: false },
            { field: 'target_audience', patterns: [/^(target|audience|recipients?|to)$/i], required: false },
        ]
    },
    custom: {
        label: 'Custom Data',
        description: 'Store as flexible data — no specific mapping needed',
        icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
        fields: []
    }
};

// ─── Core Recognition Logic ─────────────────────────────────────────

function matchHeader(header: string, patterns: RegExp[]): number {
    const normalized = header.trim();
    for (const pattern of patterns) {
        if (pattern.test(normalized)) return 1.0;
    }
    // Fuzzy: check if header contains key terms
    const lower = normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const pattern of patterns) {
        const source = pattern.source.replace(/[^a-z0-9|]/gi, '').toLowerCase();
        const terms = source.split('|').filter(t => t.length > 2);
        for (const term of terms) {
            if (lower.includes(term) && term.length >= 3) return 0.7;
        }
    }
    return 0;
}

export function analyzeColumns(headers: string[], rows: any[][]): AnalyzeResult {
    const suggestions: MappingSuggestion[] = [];
    const allMappedIndices = new Set<number>();

    for (const [targetKey, targetDef] of Object.entries(TARGET_FIELDS)) {
        if (targetKey === 'custom') continue;

        const target = targetKey as UniConnectTarget;
        const matchedColumns: ColumnMapping[] = [];
        const requiredMissing: string[] = [];

        for (const fieldDef of targetDef.fields) {
            let bestMatch: { index: number; confidence: number } | null = null;

            for (let i = 0; i < headers.length; i++) {
                const conf = matchHeader(headers[i], fieldDef.patterns);
                if (conf > 0 && (!bestMatch || conf > bestMatch.confidence)) {
                    bestMatch = { index: i, confidence: conf };
                }
            }

            if (bestMatch) {
                matchedColumns.push({
                    sheetHeader: headers[bestMatch.index],
                    colIndex: bestMatch.index,
                    target,
                    targetField: fieldDef.field,
                    confidence: bestMatch.confidence,
                    required: fieldDef.required
                });
            } else if (fieldDef.required) {
                requiredMissing.push(fieldDef.field);
            }
        }

        if (matchedColumns.length === 0) continue;

        // Calculate overall confidence
        const requiredMatched = matchedColumns.filter(m => m.required).length;
        const requiredTotal = targetDef.fields.filter(f => f.required).length;
        const avgConfidence = matchedColumns.reduce((sum, m) => sum + m.confidence, 0) / matchedColumns.length;
        const requiredRatio = requiredTotal > 0 ? requiredMatched / requiredTotal : 1;
        const overallConfidence = avgConfidence * 0.4 + requiredRatio * 0.4 + Math.min(matchedColumns.length / 4, 1) * 0.2;

        // Only suggest if we have at least 2 matched columns or 1 required match
        if (matchedColumns.length >= 2 || (requiredMatched >= 1 && matchedColumns.length >= 1)) {
            const matchedIndices = matchedColumns.map(m => m.colIndex);
            const unmatchedColumns = headers.filter((_, i) => !matchedIndices.includes(i));

            suggestions.push({
                target,
                label: targetDef.label,
                description: targetDef.description,
                icon: targetDef.icon,
                matchedColumns,
                unmatchedColumns,
                requiredMissing,
                confidence: Math.round(overallConfidence * 100) / 100,
                canImport: requiredMissing.length === 0
            });
        }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Collect all mapped indices from the best suggestion
    if (suggestions.length > 0) {
        for (const m of suggestions[0].matchedColumns) {
            allMappedIndices.add(m.colIndex);
        }
    }

    const unmappedHeaders = headers.filter((_, i) => !allMappedIndices.has(i));

    return {
        suggestions,
        unmappedHeaders,
        totalColumns: headers.length,
        totalRows: rows.length
    };
}

// ─── Import Functions ───────────────────────────────────────────────

export async function importStudentsFromSheet(
    rows: any[][],
    mappings: ColumnMapping[],
    universityId: string,
    createdBy: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const fieldMap = new Map(mappings.map(m => [m.targetField, m.colIndex]));
    const nameIdx = fieldMap.get('name');
    const emailIdx = fieldMap.get('email');
    const extIdIdx = fieldMap.get('external_id');

    if (nameIdx === undefined || emailIdx === undefined) {
        return { imported: 0, skipped: 0, errors: ['Name and Email columns are required'] };
    }

    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const students: any[] = [];

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const name = (row[nameIdx] || '').toString().trim();
        const email = (row[emailIdx] || '').toString().trim().toLowerCase();

        if (!name || !email) { skipped++; continue; }
        if (!email.includes('@')) { errors.push(`Row ${r + 1}: Invalid email "${email}"`); skipped++; continue; }

        // Build metadata from extra mapped fields
        const metadata: any = {};
        for (const [field, idx] of fieldMap) {
            if (!['name', 'email', 'external_id'].includes(field) && row[idx]) {
                metadata[field] = row[idx].toString().trim();
            }
        }

        students.push({
            university_id: universityId,
            name,
            email,
            external_id: extIdIdx !== undefined ? (row[extIdIdx] || email).toString().trim() : email,
            created_by: createdBy,
            metadata,
            sort_order: r
        });
    }

    if (students.length > 0) {
        // Dedupe against BOTH UNIQUE constraints on the students table —
        // see createStudentsBulk in db/students.ts for the full rationale.
        // Two source rows colliding on (university_id, external_id) within
        // the same INSERT triggers "ON CONFLICT DO UPDATE command cannot
        // affect row a second time"; collisions on (university_id, email)
        // trigger a UNIQUE-violation. Last-write-wins on both keys.
        const byExtId = new Map<string, typeof students[0]>();
        for (const s of students) {
            const effectiveExtId = String(s.external_id || s.email || '').trim();
            if (!effectiveExtId) continue;
            byExtId.set(`${s.university_id}:${effectiveExtId}`, s);
        }
        const byEmail = new Map<string, typeof students[0]>();
        for (const s of byExtId.values()) {
            byEmail.set(`${s.university_id}:${s.email.trim().toLowerCase()}`, s);
        }
        const uniqueStudents = Array.from(byEmail.values());
        const dedupDropped = students.length - uniqueStudents.length;
        if (dedupDropped > 0) {
            skipped += dedupDropped;
            console.warn(`[importStudentsFromSheet] dropped ${dedupDropped} duplicate rows (${students.length} → ${uniqueStudents.length}); last-write-wins`);
        }

        try {
            // Batch insert with ON CONFLICT
            const batchSize = 100;
            for (let i = 0; i < uniqueStudents.length; i += batchSize) {
                const batch = uniqueStudents.slice(i, i + batchSize);
                const values: any[] = [];
                const placeholders: string[] = [];
                batch.forEach((s, idx) => {
                    const offset = idx * 7;
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                    values.push(s.university_id, s.name, s.email, s.external_id, s.created_by, JSON.stringify(s.metadata), s.sort_order);
                });
                await db.query(
                    `INSERT INTO students (university_id, name, email, external_id, created_by, metadata, sort_order)
                     VALUES ${placeholders.join(', ')}
                     ON CONFLICT (university_id, external_id) DO UPDATE SET
                       name = EXCLUDED.name, email = EXCLUDED.email, metadata = EXCLUDED.metadata, updated_at = NOW()`,
                    values
                );
                imported += batch.length;
            }
        } catch (err: any) {
            errors.push(`DB error: ${err.message}`);
        }
    }

    return { imported, skipped, errors };
}

export async function importEventsFromSheet(
    rows: any[][],
    mappings: ColumnMapping[],
    universityId: string,
    createdBy: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const fieldMap = new Map(mappings.map(m => [m.targetField, m.colIndex]));
    const titleIdx = fieldMap.get('title');
    const startIdx = fieldMap.get('start_date');

    if (titleIdx === undefined || startIdx === undefined) {
        return { imported: 0, skipped: 0, errors: ['Title and Start Date columns are required'] };
    }

    let imported = 0, skipped = 0;
    const errors: string[] = [];

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const title = (row[titleIdx] || '').toString().trim();
        const startRaw = (row[startIdx] || '').toString().trim();

        if (!title || !startRaw) { skipped++; continue; }

        const startDate = parseFlexibleDate(startRaw);
        if (!startDate) { errors.push(`Row ${r + 1}: Invalid date "${startRaw}"`); skipped++; continue; }

        const dueIdx = fieldMap.get('due_date');
        const dueDate = dueIdx !== undefined && row[dueIdx] ? parseFlexibleDate(row[dueIdx].toString().trim()) : startDate;

        const descIdx = fieldMap.get('description');
        const typeIdx = fieldMap.get('type');
        const priorityIdx = fieldMap.get('priority');

        try {
            await db.query(
                `INSERT INTO schedule_events (university_id, title, type, description, priority, start_date, due_date, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    universityId, title,
                    typeIdx !== undefined ? normalizeEventType(row[typeIdx]?.toString() || '') : 'EVENT',
                    descIdx !== undefined ? (row[descIdx] || '').toString().trim() : '',
                    priorityIdx !== undefined ? (row[priorityIdx] || 'MEDIUM').toString().trim().toUpperCase() : 'MEDIUM',
                    startDate, dueDate || startDate, createdBy
                ]
            );
            imported++;
        } catch (err: any) {
            errors.push(`Row ${r + 1}: ${err.message}`);
            skipped++;
        }
    }

    return { imported, skipped, errors };
}

export async function importTasksFromSheet(
    rows: any[][],
    mappings: ColumnMapping[],
    universityId: string,
    createdBy: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const fieldMap = new Map(mappings.map(m => [m.targetField, m.colIndex]));
    const titleIdx = fieldMap.get('title');

    if (titleIdx === undefined) {
        return { imported: 0, skipped: 0, errors: ['Title column is required'] };
    }

    let imported = 0, skipped = 0;
    const errors: string[] = [];

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const title = (row[titleIdx] || '').toString().trim();
        if (!title) { skipped++; continue; }

        const descIdx = fieldMap.get('description');
        const priorityIdx = fieldMap.get('priority');
        const statusIdx = fieldMap.get('status');
        const dueIdx = fieldMap.get('due_date');
        const startIdx = fieldMap.get('start_date');

        const priority = priorityIdx !== undefined ? normalizePriority(row[priorityIdx]?.toString() || '') : 'MEDIUM';
        const status = statusIdx !== undefined ? normalizeTaskStatus(row[statusIdx]?.toString() || '') : 'PENDING';
        const dueDate = dueIdx !== undefined && row[dueIdx] ? parseFlexibleDate(row[dueIdx].toString().trim()) : null;
        const startDate = startIdx !== undefined && row[startIdx] ? parseFlexibleDate(row[startIdx].toString().trim()) : null;

        try {
            await db.query(
                `INSERT INTO tasks (title, description, priority, status, assigned_by, university_id, start_date, due_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    title,
                    descIdx !== undefined ? (row[descIdx] || '').toString().trim() : '',
                    priority, status, createdBy, universityId,
                    startDate, dueDate
                ]
            );
            imported++;
        } catch (err: any) {
            errors.push(`Row ${r + 1}: ${err.message}`);
            skipped++;
        }
    }

    return { imported, skipped, errors };
}

export async function importCustomData(
    sheetConnectionId: string,
    tab: string,
    headers: string[],
    rows: any[][]
): Promise<{ stored: number }> {
    // Already stored as JSONB via saveSheetSyncData — this just confirms it
    // The data is always available in sheet_sync_data regardless of mapping
    return { stored: rows.length };
}

// ─── Helpers ────────────────────────────────────────────────────────

function parseFlexibleDate(raw: string): string | null {
    if (!raw) return null;
    // Try standard formats
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

    // Try DD/MM/YYYY or DD-MM-YYYY
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
        const [, day, month, yearRaw] = match;
        const year = yearRaw.length === 2 ? '20' + yearRaw : yearRaw;
        const d2 = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
    }

    return null;
}

function normalizeEventType(raw: string): string {
    const lower = raw.toLowerCase().trim();
    if (lower.includes('holiday')) return 'HOLIDAY';
    if (lower.includes('exam')) return 'EXAM';
    if (lower.includes('curricular')) return lower.includes('co') ? 'CO_CURRICULAR' : 'CURRICULAR';
    if (lower.includes('club')) return 'CLUB_ACTIVITY';
    if (lower.includes('cultural')) return 'CULTURAL_ACTIVITY';
    return 'EVENT';
}

function normalizePriority(raw: string): string {
    const lower = raw.toLowerCase().trim();
    if (lower.includes('urgent') || lower.includes('critical')) return 'URGENT';
    if (lower.includes('high')) return 'HIGH';
    if (lower.includes('low')) return 'LOW';
    return 'MEDIUM';
}

function normalizeTaskStatus(raw: string): string {
    const lower = raw.toLowerCase().trim();
    if (lower.includes('progress') || lower.includes('doing') || lower.includes('active')) return 'IN_PROGRESS';
    if (lower.includes('complete') || lower.includes('done') || lower.includes('finish')) return 'COMPLETED';
    if (lower.includes('cancel')) return 'CANCELLED';
    return 'PENDING';
}
