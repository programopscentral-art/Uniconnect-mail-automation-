import { db } from './client';

// ─── Sheet Config ────────────────────────────────────────────────────

export async function getOpsSheetConfig() {
    const res = await db.query('SELECT * FROM ops_sheet_config WHERE is_active = true ORDER BY id DESC LIMIT 1');
    return res.rows[0] || null;
}

export async function upsertOpsSheetConfig(sheetUrl: string, createdBy?: string) {
    const res = await db.query(
        `INSERT INTO ops_sheet_config (sheet_url, created_by)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [sheetUrl, createdBy]
    );
    if (res.rows[0]) return res.rows[0];
    // Update existing
    const update = await db.query(
        `UPDATE ops_sheet_config SET sheet_url = $1, updated_at = NOW() WHERE is_active = true RETURNING *`,
        [sheetUrl]
    );
    return update.rows[0];
}

export async function updateSheetLastSynced(configId: number) {
    await db.query('UPDATE ops_sheet_config SET last_synced_at = NOW() WHERE id = $1', [configId]);
}

// ─── Daily Data CRUD ─────────────────────────────────────────────────

export async function upsertOpsDailyData(rows: any[]) {
    if (!rows.length) return;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        for (const r of rows) {
            await client.query(
                `INSERT INTO ops_daily_data (
                    date, university_name,
                    sessions_planned, sessions_completed, sessions_cancelled,
                    enrolled, attended,
                    coach_calls, parent_calls,
                    instructors_total, instructors_on_leave,
                    events_planned, events_executed, events_cancelled,
                    exams_planned, exams_completed,
                    post_exam_comms_sent,
                    at_risk_total, at_risk_informed,
                    acknowledgments,
                    report_submitted_by, report_submitted_at,
                    instructor_report, coach_report, ops_report,
                    instructors_active, coaches_active, program_ops_active,
                    total_calls_made, tickets_resolved, clicks_shares_sent,
                    avg_hours_instructors, avg_hours_coaches, avg_hours_program_ops,
                    cancellation_reason
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
                    $32, $33, $34, $35
                )
                ON CONFLICT (date, university_name)
                DO UPDATE SET
                    sessions_planned = EXCLUDED.sessions_planned,
                    sessions_completed = EXCLUDED.sessions_completed,
                    sessions_cancelled = EXCLUDED.sessions_cancelled,
                    enrolled = EXCLUDED.enrolled,
                    attended = EXCLUDED.attended,
                    coach_calls = EXCLUDED.coach_calls,
                    parent_calls = EXCLUDED.parent_calls,
                    instructors_total = EXCLUDED.instructors_total,
                    instructors_on_leave = EXCLUDED.instructors_on_leave,
                    events_planned = EXCLUDED.events_planned,
                    events_executed = EXCLUDED.events_executed,
                    events_cancelled = EXCLUDED.events_cancelled,
                    exams_planned = EXCLUDED.exams_planned,
                    exams_completed = EXCLUDED.exams_completed,
                    post_exam_comms_sent = EXCLUDED.post_exam_comms_sent,
                    at_risk_total = EXCLUDED.at_risk_total,
                    at_risk_informed = EXCLUDED.at_risk_informed,
                    acknowledgments = EXCLUDED.acknowledgments,
                    report_submitted_by = EXCLUDED.report_submitted_by,
                    report_submitted_at = EXCLUDED.report_submitted_at,
                    instructor_report = EXCLUDED.instructor_report,
                    coach_report = EXCLUDED.coach_report,
                    ops_report = EXCLUDED.ops_report,
                    instructors_active = EXCLUDED.instructors_active,
                    coaches_active = EXCLUDED.coaches_active,
                    program_ops_active = EXCLUDED.program_ops_active,
                    total_calls_made = EXCLUDED.total_calls_made,
                    tickets_resolved = EXCLUDED.tickets_resolved,
                    clicks_shares_sent = EXCLUDED.clicks_shares_sent,
                    avg_hours_instructors = EXCLUDED.avg_hours_instructors,
                    avg_hours_coaches = EXCLUDED.avg_hours_coaches,
                    avg_hours_program_ops = EXCLUDED.avg_hours_program_ops,
                    cancellation_reason = COALESCE(EXCLUDED.cancellation_reason, ops_daily_data.cancellation_reason)`,
                [
                    r.date, r.university_name,
                    r.sessions_planned || 0, r.sessions_completed || 0, r.sessions_cancelled || 0,
                    r.enrolled || 0, r.attended || 0,
                    r.coach_calls || 0, r.parent_calls || 0,
                    r.instructors_total || 0, r.instructors_on_leave || 0,
                    r.events_planned || 0, r.events_executed || 0, r.events_cancelled || 0,
                    r.exams_planned || 0, r.exams_completed || 0,
                    r.post_exam_comms_sent || 0,
                    r.at_risk_total || 0, r.at_risk_informed || 0,
                    r.acknowledgments || 0,
                    r.report_submitted_by || null, r.report_submitted_at || null,
                    r.instructor_report || 'Missing', r.coach_report || 'Missing', r.ops_report || 'Missing',
                    r.instructors_active || 0, r.coaches_active || 0, r.program_ops_active || 0,
                    r.total_calls_made || 0, r.tickets_resolved || 0, r.clicks_shares_sent || 0,
                    r.avg_hours_instructors || 0, r.avg_hours_coaches || 0, r.avg_hours_program_ops || 0,
                    r.cancellation_reason || null
                ]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── Clear Data ─────────────────────────────────────────────────────

export async function clearOpsData(date?: string) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (date) {
            await client.query('DELETE FROM ops_instructor_daily WHERE date = $1', [date]);
            await client.query('DELETE FROM ops_daily_data WHERE date = $1', [date]);
        } else {
            await client.query('DELETE FROM ops_instructor_daily');
            await client.query('DELETE FROM ops_daily_data');
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── Query Helpers ───────────────────────────────────────────────────

export async function getOpsDailyByDate(date: string) {
    const res = await db.query(
        'SELECT * FROM ops_daily_data WHERE date = $1 ORDER BY university_name',
        [date]
    );
    return res.rows;
}

export async function getOpsDataRange(startDate: string, endDate: string, universityName?: string) {
    let query = 'SELECT * FROM ops_daily_data WHERE date >= $1 AND date <= $2';
    const params: any[] = [startDate, endDate];
    if (universityName) {
        query += ' AND university_name = $3';
        params.push(universityName);
    }
    query += ' ORDER BY date, university_name';
    const res = await db.query(query, params);
    return res.rows;
}

export async function getOpsUniversities() {
    const res = await db.query(
        'SELECT DISTINCT university_name FROM ops_daily_data ORDER BY university_name'
    );
    return res.rows.map((r: any) => r.university_name);
}

// ─── Aggregation Queries ─────────────────────────────────────────────

export async function getOpsTodaySummary(date: string) {
    const res = await db.query(
        `SELECT
            COALESCE(SUM(sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(enrolled), 0) as enrolled,
            COALESCE(SUM(attended), 0) as attended,
            COALESCE(SUM(coach_calls), 0) as coach_calls,
            COALESCE(SUM(parent_calls), 0) as parent_calls,
            COALESCE(SUM(instructors_total), 0) as instructors_total,
            COALESCE(SUM(instructors_on_leave), 0) as instructors_on_leave,
            COALESCE(SUM(at_risk_total), 0) as at_risk_total,
            COALESCE(SUM(at_risk_informed), 0) as at_risk_informed,
            COALESCE(SUM(acknowledgments), 0) as acknowledgments,
            COUNT(DISTINCT university_name) as university_count
        FROM ops_daily_data WHERE date = $1`,
        [date]
    );
    return res.rows[0];
}

export async function getOpsWeekSummary(startDate: string, endDate: string) {
    const res = await db.query(
        `SELECT
            COALESCE(SUM(sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(enrolled), 0) as enrolled,
            COALESCE(SUM(attended), 0) as attended,
            COALESCE(SUM(coach_calls), 0) as coach_calls,
            COALESCE(SUM(parent_calls), 0) as parent_calls,
            COALESCE(SUM(at_risk_total), 0) as at_risk_total,
            COALESCE(SUM(at_risk_informed), 0) as at_risk_informed,
            COALESCE(SUM(events_planned), 0) as events_planned,
            COALESCE(SUM(events_executed), 0) as events_executed,
            COALESCE(SUM(events_cancelled), 0) as events_cancelled,
            COALESCE(SUM(exams_planned), 0) as exams_planned,
            COALESCE(SUM(exams_completed), 0) as exams_completed,
            COALESCE(SUM(post_exam_comms_sent), 0) as post_exam_comms_sent
        FROM ops_daily_data WHERE date >= $1 AND date <= $2`,
        [startDate, endDate]
    );
    return res.rows[0];
}

export async function getOpsMonthSummary(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    return getOpsWeekSummary(startDate, endDate);
}

export async function getOpsComplianceData(startDate: string, endDate: string) {
    const res = await db.query(
        `SELECT date, university_name,
            report_submitted_by, report_submitted_at,
            instructor_report, coach_report, ops_report
        FROM ops_daily_data
        WHERE date >= $1 AND date <= $2
        ORDER BY university_name, date`,
        [startDate, endDate]
    );
    return res.rows;
}

export async function getOpsSessionsByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            sessions_planned, sessions_completed, sessions_cancelled
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return res.rows;
}

export async function getOpsAttendanceByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            enrolled, attended, (enrolled - attended) as absent,
            coach_calls
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return res.rows;
}

export async function getOpsInstructorsByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            instructors_total, instructors_on_leave
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return res.rows;
}

export async function getOpsWeekByUniversity(startDate: string, endDate: string) {
    const res = await db.query(
        `SELECT university_name,
            COALESCE(SUM(sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(enrolled), 0) as enrolled,
            COALESCE(SUM(attended), 0) as attended,
            COALESCE(SUM(coach_calls), 0) as coach_calls,
            COALESCE(SUM(instructors_on_leave), 0) as instructors_on_leave
        FROM ops_daily_data
        WHERE date >= $1 AND date <= $2
        GROUP BY university_name
        ORDER BY university_name`,
        [startDate, endDate]
    );
    return res.rows;
}

export async function getOpsTeamActivity(date: string, universityName?: string) {
    let query = `SELECT university_name,
        instructors_active, coaches_active, program_ops_active,
        total_calls_made, tickets_resolved, clicks_shares_sent,
        avg_hours_instructors, avg_hours_coaches, avg_hours_program_ops
    FROM ops_daily_data WHERE date = $1`;
    const params: any[] = [date];
    if (universityName) {
        query += ' AND university_name = $2';
        params.push(universityName);
    }
    query += ' ORDER BY university_name';
    const res = await db.query(query, params);
    return res.rows;
}

// ─── Instructor Daily Activity ───────────────────────────────────────

export async function upsertOpsInstructorDaily(rows: any[]) {
    if (!rows.length) return;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        for (const r of rows) {
            await client.query(
                `INSERT INTO ops_instructor_daily (
                    date, university_name, instructor_name, role,
                    teach_sessions_planned, teach_sessions_done,
                    practice_sessions_planned, practice_sessions_done,
                    hours_logged, calls_made, tickets_resolved, clicks_shares_sent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (date, university_name, instructor_name)
                DO UPDATE SET
                    role = EXCLUDED.role,
                    teach_sessions_planned = EXCLUDED.teach_sessions_planned,
                    teach_sessions_done = EXCLUDED.teach_sessions_done,
                    practice_sessions_planned = EXCLUDED.practice_sessions_planned,
                    practice_sessions_done = EXCLUDED.practice_sessions_done,
                    hours_logged = EXCLUDED.hours_logged,
                    calls_made = EXCLUDED.calls_made,
                    tickets_resolved = EXCLUDED.tickets_resolved,
                    clicks_shares_sent = EXCLUDED.clicks_shares_sent`,
                [
                    r.date, r.university_name, r.instructor_name, r.role || 'Instructor',
                    r.teach_sessions_planned || 0, r.teach_sessions_done || 0,
                    r.practice_sessions_planned || 0, r.practice_sessions_done || 0,
                    r.hours_logged || 0, r.calls_made || 0, r.tickets_resolved || 0, r.clicks_shares_sent || 0
                ]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function getOpsInstructorActivity(date: string, universityName?: string, role?: string) {
    let query = 'SELECT * FROM ops_instructor_daily WHERE date = $1';
    const params: any[] = [date];
    let idx = 2;
    if (universityName) {
        query += ` AND university_name = $${idx++}`;
        params.push(universityName);
    }
    if (role && role !== 'All roles') {
        query += ` AND role = $${idx++}`;
        params.push(role);
    }
    query += ' ORDER BY university_name, instructor_name';
    const res = await db.query(query, params);
    return res.rows;
}

// ─── Reports: Daily/Weekly/Monthly ───────────────────────────────────

export async function getOpsDailyReport(date: string) {
    const [todaySummary, byUniv, compliance] = await Promise.all([
        getOpsTodaySummary(date),
        getOpsDailyByDate(date),
        getOpsComplianceData(date, date)
    ]);
    return { date, summary: todaySummary, byUniversity: byUniv, compliance };
}

export async function getOpsWeeklyReport(weekStart: string, weekEnd: string) {
    const [summary, byUniv, dailyData, compliance] = await Promise.all([
        getOpsWeekSummary(weekStart, weekEnd),
        getOpsWeekByUniversity(weekStart, weekEnd),
        getOpsDataRange(weekStart, weekEnd),
        getOpsComplianceData(weekStart, weekEnd)
    ]);
    return { weekStart, weekEnd, summary, byUniversity: byUniv, dailyBreakdown: dailyData, compliance };
}

export async function getOpsMonthlyReport(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const [summary, byUniv, dailyData, compliance] = await Promise.all([
        getOpsWeekSummary(startDate, endDate),
        getOpsWeekByUniversity(startDate, endDate),
        getOpsDataRange(startDate, endDate),
        getOpsComplianceData(startDate, endDate)
    ]);
    return { year, month, startDate, endDate, summary, byUniversity: byUniv, dailyBreakdown: dailyData, compliance };
}

// ─── CSV Parsing ─────────────────────────────────────────────────────

export function parseOpsCSV(csvText: string, dateOverride?: string): { dailyData: any[]; instructorData: any[] } {
    // Strip BOM and normalize line endings
    const cleanText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.trim().split('\n');
    if (lines.length < 2) return { dailyData: [], instructorData: [] };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const dailyData: any[] = [];
    const instructorData: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue;

        const row: any = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx]?.trim() || '';
        });

        // Detect if this is instructor-level data (has instructor_name column)
        if (row.instructor_name) {
            instructorData.push({
                date: row.date,
                university_name: row.university_name || row.university,
                instructor_name: row.instructor_name,
                role: row.role || 'Instructor',
                teach_sessions_planned: parseInt(row.teach_sessions_planned) || 0,
                teach_sessions_done: parseInt(row.teach_sessions_done) || 0,
                practice_sessions_planned: parseInt(row.practice_sessions_planned) || 0,
                practice_sessions_done: parseInt(row.practice_sessions_done) || 0,
                hours_logged: parseFloat(row.hours_logged) || 0,
                calls_made: parseInt(row.calls_made) || 0,
                tickets_resolved: parseInt(row.tickets_resolved) || 0,
                clicks_shares_sent: parseInt(row.clicks_shares_sent) || 0,
            });
        } else {
            // dateOverride ALWAYS wins if provided; otherwise use CSV date or today
            const rowDate = dateOverride || row.date || new Date().toISOString().split('T')[0];
            const uniName = (row.university_name || row.university || '').trim();
            if (!uniName) continue; // skip rows without university name

            dailyData.push({
                date: rowDate,
                university_name: uniName,
                sessions_planned: parseInt(row.sessions_planned) || 0,
                sessions_completed: parseInt(row.sessions_completed) || 0,
                sessions_cancelled: parseInt(row.sessions_cancelled) || 0,
                enrolled: parseInt(row.enrolled) || 0,
                attended: parseInt(row.attended) || 0,
                coach_calls: parseInt(row.coach_calls) || 0,
                parent_calls: parseInt(row.parent_calls) || 0,
                instructors_total: parseInt(row.instructors_total) || 0,
                instructors_on_leave: parseInt(row.instructors_on_leave || row.leave_today) || 0,
                events_planned: parseInt(row.events_planned) || 0,
                events_executed: parseInt(row.events_executed) || 0,
                events_cancelled: parseInt(row.events_cancelled) || 0,
                exams_planned: parseInt(row.exams_planned) || 0,
                exams_completed: parseInt(row.exams_completed || row.exams_executed) || 0,
                post_exam_comms_sent: parseInt(row.post_exam_comms_sent || row.email_sent) || 0,
                at_risk_total: parseInt(row.at_risk_total || row.at_risk) || 0,
                at_risk_informed: parseInt(row.at_risk_informed || row.risk_informed || row.fail_risk_informed) || 0,
                acknowledgments: parseInt(row.acknowledgments || row.acks || row.parent_acks_comms) || 0,
                report_submitted_by: row.report_submitted_by || null,
                report_submitted_at: row.report_submitted_at || (row.reports_uploaded ? '18:00' : null),
                instructor_report: row.instructor_report || (row.reports_uploaded ? 'Filed' : 'Missing'),
                coach_report: row.coach_report || (row.reports_uploaded ? 'Filed' : 'Missing'),
                ops_report: row.ops_report || (row.reports_uploaded ? 'Filed' : 'Missing'),
                instructors_active: parseInt(row.instructors_active || row.instructors_total) || 0,
                coaches_active: parseInt(row.coaches_active) || 0,
                program_ops_active: parseInt(row.program_ops_active) || 0,
                total_calls_made: parseInt(row.total_calls_made || row.coach_calls) || 0,
                tickets_resolved: parseInt(row.tickets_resolved) || 0,
                clicks_shares_sent: parseInt(row.clicks_shares_sent || row.wa_sent) || 0,
                avg_hours_instructors: parseFloat(row.avg_hours_instructors) || 0,
                avg_hours_coaches: parseFloat(row.avg_hours_coaches) || 0,
                avg_hours_program_ops: parseFloat(row.avg_hours_program_ops) || 0,
                cancellation_reason: row.cancellation_reason || row.cancel_reason || row.reason || null,
            });
        }
    }
    return { dailyData, instructorData };
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

// ─── Sample Data Generator ───────────────────────────────────────────

export function generateOpsSampleData(): { dailyData: any[]; instructorData: any[] } {
    const universities = [
        'JNTU Hyderabad', 'Osmania University', 'OU Engg College', 'CBIT', 'MGIT',
        'VBIT', 'VNRVJIET', 'CVR College', 'CMR College', 'Malla Reddy',
        'SR Engineering', 'Vardhaman College', 'KITS Warangal', 'JNTUK Kakinada',
        'RGUKT Basar', 'Siddhartha Engg', 'KL University'
    ];

    const instructorNames: Record<string, string[]> = {
        'JNTU Hyderabad': ['Ravi Kumar', 'Priya Sharma', 'Suresh Reddy', 'Anita Devi'],
        'Osmania University': ['Kiran Rao', 'Lakshmi Prasad', 'Vijay Kumar', 'Meera Nair'],
        'OU Engg College': ['Rajesh Singh', 'Sunita Kumari', 'Arun Prakash'],
        'CBIT': ['Deepak Joshi', 'Kavya Reddy', 'Manish Gupta'],
        'MGIT': ['Sanjay Verma', 'Pooja Rani', 'Rahul Sharma'],
    };

    const today = new Date();
    const dailyData: any[] = [];
    const instructorData: any[] = [];

    // Generate 30 days of data
    for (let d = 29; d >= 0; d--) {
        const date = new Date(today);
        date.setDate(date.getDate() - d);
        const dateStr = date.toISOString().split('T')[0];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        for (const univ of universities) {
            const baseEnrolled = 200 + Math.floor(Math.random() * 200);
            const attendanceRate = isWeekend ? 0 : (0.82 + Math.random() * 0.16);
            const sessPlanned = isWeekend ? 0 : (4 + Math.floor(Math.random() * 10));
            const sessCompleted = Math.floor(sessPlanned * (0.8 + Math.random() * 0.2));
            const sessCancelled = sessPlanned - sessCompleted;
            const instTotal = 10 + Math.floor(Math.random() * 15);
            const instOnLeave = isWeekend ? 0 : Math.floor(Math.random() * 3);
            const evPlanned = Math.floor(Math.random() * 5);
            const evExecuted = Math.floor(evPlanned * (0.6 + Math.random() * 0.4));
            const exPlanned = Math.floor(Math.random() * 4);
            const exCompleted = Math.floor(exPlanned * (0.5 + Math.random() * 0.5));
            const atRisk = 5 + Math.floor(Math.random() * 15);

            const reportHour = 18 + Math.floor(Math.random() * 6);
            const reportMin = Math.floor(Math.random() * 60);
            const didSubmit = Math.random() > 0.25;
            const hasInstructorReport = didSubmit && Math.random() > 0.2;
            const hasCoachReport = didSubmit && Math.random() > 0.3;
            const hasOpsReport = didSubmit && Math.random() > 0.4;

            dailyData.push({
                date: dateStr,
                university_name: univ,
                sessions_planned: sessPlanned,
                sessions_completed: sessCompleted,
                sessions_cancelled: sessCancelled,
                enrolled: baseEnrolled,
                attended: isWeekend ? 0 : Math.floor(baseEnrolled * attendanceRate),
                coach_calls: isWeekend ? 0 : (8 + Math.floor(Math.random() * 18)),
                parent_calls: isWeekend ? 0 : (3 + Math.floor(Math.random() * 10)),
                instructors_total: instTotal,
                instructors_on_leave: instOnLeave,
                events_planned: evPlanned,
                events_executed: evExecuted,
                events_cancelled: evPlanned - evExecuted,
                exams_planned: exPlanned,
                exams_completed: exCompleted,
                post_exam_comms_sent: Math.floor(exCompleted * (0.5 + Math.random() * 0.5)),
                at_risk_total: atRisk,
                at_risk_informed: Math.floor(atRisk * (0.5 + Math.random() * 0.5)),
                acknowledgments: isWeekend ? 0 : (3 + Math.floor(Math.random() * 8)),
                report_submitted_by: didSubmit ? 'Campus incharge' : null,
                report_submitted_at: didSubmit ? `${reportHour}:${String(reportMin).padStart(2, '0')}` : null,
                instructor_report: hasInstructorReport ? 'Filed' : 'Missing',
                coach_report: hasCoachReport ? 'Filed' : 'Missing',
                ops_report: hasOpsReport ? 'Filed' : 'Missing',
                instructors_active: isWeekend ? 0 : (instTotal - instOnLeave),
                coaches_active: isWeekend ? 0 : (3 + Math.floor(Math.random() * 5)),
                program_ops_active: isWeekend ? 0 : (2 + Math.floor(Math.random() * 4)),
                total_calls_made: isWeekend ? 0 : (15 + Math.floor(Math.random() * 30)),
                tickets_resolved: isWeekend ? 0 : Math.floor(Math.random() * 8),
                clicks_shares_sent: isWeekend ? 0 : Math.floor(Math.random() * 10),
                avg_hours_instructors: isWeekend ? 0 : +(5 + Math.random() * 3).toFixed(1),
                avg_hours_coaches: isWeekend ? 0 : +(5 + Math.random() * 3).toFixed(1),
                avg_hours_program_ops: isWeekend ? 0 : +(4 + Math.random() * 3).toFixed(1),
            });

            // Generate instructor data for universities that have instructors defined
            if (instructorNames[univ] && !isWeekend) {
                for (const name of instructorNames[univ]) {
                    const roles = ['Instructor', 'Success coach', 'Program ops'];
                    const role = roles[Math.floor(Math.random() * roles.length)];
                    const tsp = 3 + Math.floor(Math.random() * 5);
                    const psp = 1 + Math.floor(Math.random() * 4);
                    instructorData.push({
                        date: dateStr,
                        university_name: univ,
                        instructor_name: name,
                        role,
                        teach_sessions_planned: tsp,
                        teach_sessions_done: Math.floor(tsp * (0.7 + Math.random() * 0.3)),
                        practice_sessions_planned: psp,
                        practice_sessions_done: Math.floor(psp * (0.6 + Math.random() * 0.4)),
                        hours_logged: +(5 + Math.random() * 4).toFixed(1),
                        calls_made: 3 + Math.floor(Math.random() * 10),
                        tickets_resolved: Math.floor(Math.random() * 5),
                        clicks_shares_sent: Math.floor(Math.random() * 8),
                    });
                }
            }
        }
    }
    return { dailyData, instructorData };
}
