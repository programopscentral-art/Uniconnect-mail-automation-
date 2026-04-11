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

// Sort the words/parts of a name so "CIET/CITY" and "CITY/CIET" become the same key
function sortedNameKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/).sort().join(' ');
}

// Known aliases for university names that can't be resolved by fuzzy matching
// Maps normalized key (lowercase, no special chars) → preferred canonical name
// Add new entries here when new duplicates are discovered
const UNIVERSITY_ALIASES: Record<string, string> = {
    'chalapathy': 'Chalapathi',
    'chalapathi': 'Chalapathi',
    'cresent': 'Crescent',
    'crescent': 'Crescent',
    'cietcity': 'CIET/CITY',
    'cityciet': 'CIET/CITY',
    'yenapoya': 'Yenapoya',
    'yenepoya': 'Yenapoya',
    'kkh': 'KKH',
    'kkhcollege': 'KKH',
    'kkhyderabad': 'KKH',
    'khajabandanawaz': 'KKH',
    // AMET / Academy
    'academy': 'AMET',
    'amet': 'AMET',
    'ametuniversity': 'AMET',
    // ADYPU / Adypatil
    'adypatil': 'Adypu',
    'adypu': 'Adypu',
    'adpatil': 'Adypu',
    'drdy': 'Adypu',
    // MRV / Mallareddy
    'mallareddy': 'MRV',
    'mrv': 'MRV',
    'mallareddyuniversity': 'MRV',
    // NIU / NOIDAINT / Noida
    'niu': 'NIU',
    'noidaint': 'NIU',
    'noida': 'NIU',
    'noidainternational': 'NIU',
    // NRI / NRIIT
    'nri': 'NRI',
    'nriit': 'NRI',
    'nriinstituteoftechnology': 'NRI',
};

// Quick sync canonical name resolver — no DB needed, just alias map + normalization
export function canonicalUnivName(name: string): string {
    if (!name) return name;
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (UNIVERSITY_ALIASES[lower]) return UNIVERSITY_ALIASES[lower];
    // Sort /-separated parts: "CITY/CIET" → "CIET/CITY"
    if (trimmed.includes('/')) {
        const sorted = trimmed.split('/').map(s => s.trim()).sort().join('/');
        const sortedKey = sorted.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (UNIVERSITY_ALIASES[sortedKey]) return UNIVERSITY_ALIASES[sortedKey];
    }
    return trimmed;
}

function resolveAlias(name: string): string | null {
    const lower = name.toLowerCase().replace(/[^a-z]/g, '');
    return UNIVERSITY_ALIASES[lower] || null;
}

async function resolveUniversityName(client: any, rawName: string): Promise<string> {
    if (!rawName) return rawName;
    const trimmed = rawName.trim();

    // 0. Check hardcoded aliases first (handles known typos like Chalapathi/Chalapathy)
    const alias = resolveAlias(trimmed);
    if (alias) return alias;

    // 1. Exact or fuzzy match against universities table
    const res = await client.query(
        `SELECT COALESCE(u.short_name, u.name) AS canonical
         FROM universities u
         WHERE u.is_team = false AND (
             LOWER(TRIM($1)) = LOWER(TRIM(u.name))
             OR LOWER(TRIM($1)) = LOWER(TRIM(u.short_name))
             OR LOWER(REPLACE(REPLACE(REPLACE(TRIM($1), '/', ''), ' ', ''), '-', '')) =
                LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(u.short_name, u.name)), '/', ''), ' ', ''), '-', ''))
             OR LOWER(REPLACE(REPLACE(REPLACE(TRIM($1), '/', ''), ' ', ''), '-', '')) =
                LOWER(REPLACE(REPLACE(REPLACE(TRIM(u.name), '/', ''), ' ', ''), '-', ''))
         )
         LIMIT 1`,
        [trimmed]
    );
    if (res.rows.length > 0) return res.rows[0].canonical;

    // 2. Try sorted-word match against universities table (handles "CIET/CITY" vs "CITY/CIET")
    const sortedKey = sortedNameKey(trimmed);
    const allUnivs = await client.query(
        `SELECT COALESCE(u.short_name, u.name) AS canonical FROM universities u WHERE u.is_team = false`
    );
    for (const u of allUnivs.rows) {
        if (sortedNameKey(u.canonical) === sortedKey) return u.canonical;
    }

    // 3. Normalize to title case for consistency across case variants
    //    "CRESCENT"/"Crescent"/"crescent" all become "Crescent"
    const titleCase = trimmed.replace(/\w\S*/g, (w: string) =>
        w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
    return titleCase;
}

export async function upsertOpsDailyData(rows: any[]) {
    if (!rows.length) return;
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Pre-resolve all university names to canonical form
        const nameCache = new Map<string, string>();
        for (const r of rows) {
            const raw = (r.university_name || '').trim();
            if (raw && !nameCache.has(raw)) {
                nameCache.set(raw, await resolveUniversityName(client, raw));
            }
        }

        for (const r of rows) {
            r.university_name = nameCache.get((r.university_name || '').trim()) || r.university_name;
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
                    report_submitted_by = COALESCE(EXCLUDED.report_submitted_by, ops_daily_data.report_submitted_by),
                    report_submitted_at = COALESCE(EXCLUDED.report_submitted_at, ops_daily_data.report_submitted_at),
                    instructor_report = CASE WHEN EXCLUDED.instructor_report IS NOT NULL AND EXCLUDED.instructor_report != 'Missing' THEN EXCLUDED.instructor_report ELSE COALESCE(ops_daily_data.instructor_report, EXCLUDED.instructor_report) END,
                    coach_report = CASE WHEN EXCLUDED.coach_report IS NOT NULL AND EXCLUDED.coach_report != 'Missing' THEN EXCLUDED.coach_report ELSE COALESCE(ops_daily_data.coach_report, EXCLUDED.coach_report) END,
                    ops_report = CASE WHEN EXCLUDED.ops_report IS NOT NULL AND EXCLUDED.ops_report != 'Missing' THEN EXCLUDED.ops_report ELSE COALESCE(ops_daily_data.ops_report, EXCLUDED.ops_report) END,
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

// ─── Normalize existing ops_daily_data university names ─────────────
// Fixes historical data: resolves free-text names to canonical names
// and merges duplicate rows (same date + canonical name) by summing values.

export async function normalizeOpsUniversityNames() {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Build rename map: old_name → canonical_name
        const rawNames = await client.query('SELECT DISTINCT university_name FROM ops_daily_data');
        const renameMap = new Map<string, string>();
        for (const row of rawNames.rows) {
            const canonical = await resolveUniversityName(client, row.university_name);
            if (canonical !== row.university_name) {
                renameMap.set(row.university_name, canonical);
            }
        }

        if (renameMap.size === 0) {
            await client.query('COMMIT');
            console.log('[OPS] No university names to normalize');
            return 0;
        }

        console.log(`[OPS] Normalizing ${renameMap.size} university names:`, Object.fromEntries(renameMap));

        let totalUpdated = 0;
        for (const [oldName, canonical] of renameMap) {
            // For each date where BOTH old and canonical exist, merge by summing into canonical and deleting old
            const overlapping = await client.query(
                `SELECT old.date FROM ops_daily_data old
                 INNER JOIN ops_daily_data canon ON canon.date = old.date AND canon.university_name = $2
                 WHERE old.university_name = $1`,
                [oldName, canonical]
            );

            for (const dateRow of overlapping.rows) {
                // Add old values into canonical row for this specific date
                await client.query(`
                    UPDATE ops_daily_data SET
                        sessions_planned = ops_daily_data.sessions_planned + old.sessions_planned,
                        sessions_completed = ops_daily_data.sessions_completed + old.sessions_completed,
                        sessions_cancelled = ops_daily_data.sessions_cancelled + old.sessions_cancelled,
                        enrolled = ops_daily_data.enrolled + old.enrolled,
                        attended = ops_daily_data.attended + old.attended,
                        coach_calls = ops_daily_data.coach_calls + old.coach_calls,
                        parent_calls = ops_daily_data.parent_calls + old.parent_calls,
                        instructors_on_leave = ops_daily_data.instructors_on_leave + old.instructors_on_leave,
                        at_risk_total = ops_daily_data.at_risk_total + old.at_risk_total,
                        at_risk_informed = ops_daily_data.at_risk_informed + old.at_risk_informed,
                        events_planned = ops_daily_data.events_planned + old.events_planned,
                        events_executed = ops_daily_data.events_executed + old.events_executed,
                        events_cancelled = ops_daily_data.events_cancelled + old.events_cancelled,
                        exams_planned = ops_daily_data.exams_planned + old.exams_planned,
                        exams_completed = ops_daily_data.exams_completed + old.exams_completed,
                        post_exam_comms_sent = ops_daily_data.post_exam_comms_sent + old.post_exam_comms_sent
                    FROM ops_daily_data old
                    WHERE old.university_name = $1 AND old.date = $3
                      AND ops_daily_data.university_name = $2 AND ops_daily_data.date = $3
                `, [oldName, canonical, dateRow.date]);

                // Delete the old row for this date
                await client.query(
                    'DELETE FROM ops_daily_data WHERE university_name = $1 AND date = $2',
                    [oldName, dateRow.date]
                );
            }

            // Rename any remaining old rows (dates where canonical didn't exist) directly
            const renamed = await client.query(
                'UPDATE ops_daily_data SET university_name = $1 WHERE university_name = $2',
                [canonical, oldName]
            );
            totalUpdated += (renamed.rowCount || 0) + overlapping.rows.length;
        }

        await client.query('COMMIT');
        console.log(`[OPS] Normalized university names: ${totalUpdated} rows updated/merged`);
        return totalUpdated;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── University Name Normalization ───────────────────────────────────
// ops_daily_data stores free-text university_name from various sources
// which often differ: "CHALAPATHI" vs "Chalapathy", "CIET/CITY" vs "CITY/CIET".
// This CTE resolves each to the canonical name from the universities table.

const UNIV_RESOLVE_CTE = `
    raw_resolve AS (
        SELECT DISTINCT ON (d.university_name)
            d.university_name AS raw_name,
            u.short_name AS u_short,
            u.name AS u_name,
            u.id AS university_id
        FROM (SELECT DISTINCT university_name FROM ops_daily_data) d
        LEFT JOIN universities u ON (
            LOWER(TRIM(d.university_name)) = LOWER(TRIM(u.name))
            OR LOWER(TRIM(d.university_name)) = LOWER(TRIM(u.short_name))
            OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(d.university_name), '/', ''), ' ', ''), '-', '')) =
               LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(u.short_name, u.name)), '/', ''), ' ', ''), '-', ''))
            OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(d.university_name), '/', ''), ' ', ''), '-', '')) =
               LOWER(REPLACE(REPLACE(REPLACE(TRIM(u.name), '/', ''), ' ', ''), '-', ''))
        )
        WHERE u.is_team = false OR u.id IS NULL
        ORDER BY d.university_name, u.id
    ),
    canonical_names AS (
        SELECT r.raw_name,
            COALESCE(
                r.u_short, r.u_name,
                CASE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(r.raw_name), '/', ''), ' ', ''), '-', ''), '''', ''))
                    WHEN 'chalapathy' THEN 'Chalapathi'
                    WHEN 'chalapathi' THEN 'Chalapathi'
                    WHEN 'cresent' THEN 'Crescent'
                    WHEN 'crescent' THEN 'Crescent'
                    WHEN 'cietcity' THEN 'CIET/CITY'
                    WHEN 'cityciet' THEN 'CIET/CITY'
                    WHEN 'yenapoya' THEN 'Yenapoya'
                    ELSE NULL
                END,
                INITCAP(LOWER(TRIM(r.raw_name)))
            ) AS canonical_name,
            r.university_id
        FROM raw_resolve r
    )
`;

// Apply JS alias map to all rows that have university_name
function applyCanonicalNames(rows: any[]): any[] {
    for (const r of rows) {
        if (r.university_name) r.university_name = canonicalUnivName(r.university_name);
    }
    return rows;
}

// ─── Query Helpers ───────────────────────────────────────────────────

export async function getOpsDailyByDate(date: string) {
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT d.*, cn.canonical_name as university_name
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date = $1
        ORDER BY cn.canonical_name`,
        [date]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsDataRange(startDate: string, endDate: string, universityName?: string) {
    let filter = '';
    const params: any[] = [startDate, endDate];
    if (universityName) {
        filter = ' AND cn.canonical_name = $3';
        params.push(universityName);
    }
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT d.*, cn.canonical_name as university_name
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date >= $1 AND d.date <= $2${filter}
        ORDER BY d.date, cn.canonical_name`,
        params
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsUniversities() {
    // Merge ops_daily_data names + universities master table so all universities
    // always appear in the dropdown, even if they have no ops data yet.
    const [opsRes, masterRes] = await Promise.all([
        db.query('SELECT DISTINCT university_name FROM ops_daily_data'),
        db.query("SELECT COALESCE(short_name, name) AS name FROM universities WHERE is_team = false"),
    ]);
    const seen = new Set<string>();
    const result: string[] = [];
    const addName = (raw: string) => {
        const canonical = canonicalUnivName(raw);
        if (!seen.has(canonical)) {
            seen.add(canonical);
            result.push(canonical);
        }
    };
    for (const r of opsRes.rows) addName(r.university_name);
    for (const r of masterRes.rows) addName(r.name);
    return result.sort();
}

// ─── Aggregation Queries ─────────────────────────────────────────────

export async function getOpsTodaySummary(date: string) {
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT
            COALESCE(SUM(d.sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(d.sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(d.sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(d.enrolled), 0) as enrolled,
            COALESCE(SUM(d.attended), 0) as attended,
            COALESCE(SUM(d.coach_calls), 0) as coach_calls,
            COALESCE(SUM(d.parent_calls), 0) as parent_calls,
            COALESCE(SUM(d.instructors_total), 0) as instructors_total,
            COALESCE(SUM(d.instructors_on_leave), 0) as instructors_on_leave,
            COALESCE(SUM(d.at_risk_total), 0) as at_risk_total,
            COALESCE(SUM(d.at_risk_informed), 0) as at_risk_informed,
            COALESCE(SUM(d.acknowledgments), 0) as acknowledgments,
            COUNT(DISTINCT cn.canonical_name) as university_count
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date = $1`,
        [date]
    );
    return res.rows[0];
}

export async function getOpsWeekSummary(startDate: string, endDate: string) {
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT
            COALESCE(SUM(d.sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(d.sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(d.sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(d.enrolled), 0) as enrolled,
            COALESCE(SUM(d.attended), 0) as attended,
            COALESCE(SUM(d.coach_calls), 0) as coach_calls,
            COALESCE(SUM(d.parent_calls), 0) as parent_calls,
            COALESCE(SUM(d.at_risk_total), 0) as at_risk_total,
            COALESCE(SUM(d.at_risk_informed), 0) as at_risk_informed,
            COALESCE(SUM(d.events_planned), 0) as events_planned,
            COALESCE(SUM(d.events_executed), 0) as events_executed,
            COALESCE(SUM(d.events_cancelled), 0) as events_cancelled,
            COALESCE(SUM(d.exams_planned), 0) as exams_planned,
            COALESCE(LEAST(SUM(d.exams_completed), SUM(d.exams_planned)), 0) as exams_completed,
            COALESCE(SUM(d.post_exam_comms_sent), 0) as post_exam_comms_sent,
            COALESCE(SUM(d.instructors_on_leave), 0) as instructors_on_leave,
            COUNT(DISTINCT cn.canonical_name) as university_count
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date >= $1 AND d.date <= $2`,
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
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT d.date, cn.canonical_name as university_name,
            d.report_submitted_by, d.report_submitted_at,
            d.instructor_report, d.coach_report, d.ops_report
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date >= $1 AND d.date <= $2
        ORDER BY cn.canonical_name, d.date`,
        [startDate, endDate]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsSessionsByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            sessions_planned, sessions_completed, sessions_cancelled,
            cancellation_reason
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsAttendanceByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            enrolled, attended, (enrolled - attended) as absent,
            coach_calls
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsInstructorsByUniversity(date: string) {
    const res = await db.query(
        `SELECT university_name,
            instructors_total, instructors_on_leave
        FROM ops_daily_data WHERE date = $1 ORDER BY university_name`,
        [date]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsWeekByUniversity(startDate: string, endDate: string) {
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT cn.canonical_name as university_name,
            COALESCE(SUM(d.sessions_planned), 0) as sessions_planned,
            COALESCE(SUM(d.sessions_completed), 0) as sessions_completed,
            COALESCE(SUM(d.sessions_cancelled), 0) as sessions_cancelled,
            COALESCE(SUM(d.enrolled), 0) as enrolled,
            COALESCE(SUM(d.attended), 0) as attended,
            COALESCE(SUM(d.coach_calls), 0) as coach_calls,
            COALESCE(SUM(d.parent_calls), 0) as parent_calls,
            COALESCE(SUM(d.instructors_on_leave), 0) as instructors_on_leave,
            COALESCE(SUM(d.at_risk_total), 0) as at_risk_total,
            COALESCE(SUM(d.at_risk_informed), 0) as at_risk_informed,
            COALESCE(MAX(d.instructors_total), 0) as instructors_total,
            COALESCE(SUM(d.events_planned), 0) as events_planned,
            COALESCE(SUM(d.events_executed), 0) as events_executed,
            COALESCE(SUM(d.events_cancelled), 0) as events_cancelled,
            COALESCE(SUM(d.exams_planned), 0) as exams_planned,
            COALESCE(SUM(d.exams_completed), 0) as exams_completed,
            COALESCE(SUM(d.post_exam_comms_sent), 0) as post_exam_comms_sent,
            STRING_AGG(DISTINCT d.cancellation_reason, '; ') FILTER (WHERE d.cancellation_reason IS NOT NULL) as cancellation_reason
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date >= $1 AND d.date <= $2
        GROUP BY cn.canonical_name
        ORDER BY cn.canonical_name`,
        [startDate, endDate]
    );
    return applyCanonicalNames(res.rows);
}

export async function getOpsTeamActivity(date: string, universityName?: string) {
    let filter = '';
    const params: any[] = [date];
    if (universityName) {
        filter = ' AND cn.canonical_name = $2';
        params.push(universityName);
    }
    const res = await db.query(
        `WITH ${UNIV_RESOLVE_CTE}
        SELECT cn.canonical_name as university_name,
            SUM(d.instructors_active)::int as instructors_active,
            SUM(d.coaches_active)::int as coaches_active,
            SUM(d.program_ops_active)::int as program_ops_active,
            SUM(d.total_calls_made)::int as total_calls_made,
            SUM(d.tickets_resolved)::int as tickets_resolved,
            SUM(d.clicks_shares_sent)::int as clicks_shares_sent,
            AVG(d.avg_hours_instructors) as avg_hours_instructors,
            AVG(d.avg_hours_coaches) as avg_hours_coaches,
            AVG(d.avg_hours_program_ops) as avg_hours_program_ops
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date = $1${filter}
        GROUP BY cn.canonical_name
        ORDER BY cn.canonical_name`,
        params
    );
    return applyCanonicalNames(res.rows);
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
    return applyCanonicalNames(res.rows);
}

// ─── Reports: Daily/Weekly/Monthly ───────────────────────────────────

export async function getOpsDailyReport(date: string) {
    const [todaySummary, byUniv, compliance, teamActivity] = await Promise.all([
        getOpsTodaySummary(date),
        getOpsDailyByDate(date),
        getOpsComplianceData(date, date),
        getOpsTeamActivity(date)
    ]);
    return { date, summary: todaySummary, byUniversity: byUniv, compliance, teamActivity };
}

export async function getOpsWeeklyReport(weekStart: string, weekEnd: string) {
    const [summary, byUniv, dailyData, compliance, teamActivity] = await Promise.all([
        getOpsWeekSummary(weekStart, weekEnd),
        getOpsWeekByUniversity(weekStart, weekEnd),
        getOpsDataRange(weekStart, weekEnd),
        getOpsComplianceData(weekStart, weekEnd),
        getOpsTeamActivity(weekEnd)
    ]);
    return { weekStart, weekEnd, summary, byUniversity: byUniv, dailyBreakdown: dailyData, compliance, teamActivity };
}

export async function getOpsMonthlyReport(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const [summary, byUniv, dailyData, compliance, teamActivity] = await Promise.all([
        getOpsWeekSummary(startDate, endDate),
        getOpsWeekByUniversity(startDate, endDate),
        getOpsDataRange(startDate, endDate),
        getOpsComplianceData(startDate, endDate),
        getOpsTeamActivity(endDate)
    ]);
    return { year, month, startDate, endDate, summary, byUniversity: byUniv, dailyBreakdown: dailyData, compliance, teamActivity };
}

// ─── Auto-Aggregation Engine ─────────────────────────────────────────
// Pulls data from existing UniConnect tables to auto-populate ops_daily_data

export interface DailyFormData {
    university_id: string;
    university_name: string;
    date: string; // YYYY-MM-DD
    // Fields that can't be auto-calculated (from external sessions app)
    sessions_planned: number;
    sessions_completed: number;
    sessions_cancelled: number;
    cancellation_reason?: string;
    enrolled: number;
    attended: number;
    // Fields requiring human judgment
    at_risk_total: number;
    at_risk_informed: number;
    acknowledgments: number;
    remarks?: string;
    // Submitted by
    submitted_by: string; // user ID
    submitted_by_name?: string;
}

/** Auto-aggregate data from existing app tables for a specific university and date */
export async function aggregateOpsForUniversity(universityId: string, _universityName: string, date: string) {
    // Run all queries in parallel for speed
    const [events, commTasks, users, tasks, exams] = await Promise.all([
        // 1. Events: count planned/executed/cancelled for this university on this date
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'COMPLETED')) as events_planned,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as events_executed,
                COUNT(*) FILTER (WHERE status = 'CANCELLED') as events_cancelled
            FROM schedule_events
            WHERE university_id = $1
              AND (DATE(start_date) = $2 OR DATE(due_date) = $2)
        `, [universityId, date]),

        // 2. Communication tasks: count completed by channel for this university
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE channel ILIKE '%parent%') as parent_calls,
                COUNT(*) FILTER (WHERE channel ILIKE '%student%' OR channel ILIKE '%coach%') as coach_calls,
                COUNT(*) as total_calls
            FROM communication_tasks
            WHERE status = 'Completed'
              AND DATE(COALESCE(marked_sent_at, created_at)) = $2
              AND (
                  universities @> ARRAY[$1::text]
                  OR EXISTS (
                      SELECT 1 FROM universities u
                      WHERE u.id = $1
                        AND (u.name = ANY(universities) OR u.short_name = ANY(universities) OR u.id::text = ANY(universities))
                  )
              )
        `, [universityId, date]),

        // 3. Users: count by role for this university
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE role = 'FACULTY') as instructors_total,
                COUNT(*) FILTER (WHERE role IN ('CMA', 'CMA_MANAGER')) as coaches_total,
                COUNT(*) FILTER (WHERE role IN ('PROGRAM_OPS', 'COS', 'PM', 'PMA')) as program_ops_total,
                COUNT(*) as total_staff
            FROM users
            WHERE is_active = true
              AND (
                  university_id = $1
                  OR id IN (SELECT user_id FROM user_universities WHERE university_id = $1)
              )
              AND role NOT IN ('STUDENT', 'ADMIN', 'STAKEHOLDER', 'SUPPORT')
        `, [universityId]),

        // 4. Tasks: count completed today for this university
        db.query(`
            SELECT
                COUNT(DISTINCT t.id) FILTER (WHERE ta.status = 'COMPLETED' AND DATE(ta.completed_at) = $2) as tasks_completed,
                COUNT(DISTINCT t.id) FILTER (WHERE ta.status = 'IN_PROGRESS') as tasks_in_progress,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'PENDING' AND t.due_date < NOW()) as tasks_overdue
            FROM tasks t
            JOIN task_assignees ta ON t.id = ta.task_id
            WHERE t.university_id = $1
        `, [universityId, date]),

        // 5. Exams: count papers/plans for this date
        db.query(`
            SELECT
                COUNT(*) as exams_planned
            FROM assessment_papers
            WHERE university_id = $1 AND DATE(paper_date) = $2
        `, [universityId, date]),
    ]);

    // Also check faculty leave (may not exist as a table yet, so wrap in try/catch)
    let instructorsOnLeave = 0;
    try {
        const leaveRes = await db.query(`
            SELECT COUNT(*) as on_leave
            FROM faculty_leave_requests
            WHERE university_id = $1
              AND leave_date = $2
              AND approval_status = 'APPROVED'
        `, [universityId, date]);
        instructorsOnLeave = parseInt(leaveRes.rows[0]?.on_leave) || 0;
    } catch {
        // Table may not exist yet — that's fine, default to 0
    }

    const ev = events.rows[0] || {};
    const comm = commTasks.rows[0] || {};
    const usr = users.rows[0] || {};
    const tsk = tasks.rows[0] || {};
    const exam = exams.rows[0] || {};

    return {
        // Auto-aggregated fields
        events_planned: parseInt(ev.events_planned) || 0,
        events_executed: parseInt(ev.events_executed) || 0,
        events_cancelled: parseInt(ev.events_cancelled) || 0,
        coach_calls: parseInt(comm.coach_calls) || 0,
        parent_calls: parseInt(comm.parent_calls) || 0,
        instructors_total: parseInt(usr.instructors_total) || 0,
        instructors_on_leave: instructorsOnLeave,
        exams_planned: parseInt(exam.exams_planned) || 0,
        // Team activity
        instructors_active: parseInt(usr.instructors_total) || 0,
        coaches_active: parseInt(usr.coaches_total) || 0,
        program_ops_active: parseInt(usr.program_ops_total) || 0,
        total_calls_made: parseInt(comm.total_calls) || 0,
        tickets_resolved: parseInt(tsk.tasks_completed) || 0,
    };
}

/** Merge auto-aggregated data with daily form submission and upsert to ops_daily_data */
export async function submitDailyForm(form: DailyFormData) {
    // Get auto-aggregated data
    const auto = await aggregateOpsForUniversity(form.university_id, form.university_name, form.date);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Merge: form data (manual) + auto-aggregated data
    const row = {
        date: form.date,
        university_name: form.university_name,
        // Manual fields from form
        sessions_planned: form.sessions_planned || 0,
        sessions_completed: form.sessions_completed || 0,
        sessions_cancelled: form.sessions_cancelled || 0,
        enrolled: form.enrolled || 0,
        attended: form.attended || 0,
        at_risk_total: form.at_risk_total || 0,
        at_risk_informed: form.at_risk_informed || 0,
        acknowledgments: form.acknowledgments || 0,
        cancellation_reason: form.cancellation_reason || form.remarks || null,
        // Auto-aggregated fields
        coach_calls: auto.coach_calls,
        parent_calls: auto.parent_calls,
        instructors_total: auto.instructors_total,
        instructors_on_leave: auto.instructors_on_leave,
        events_planned: auto.events_planned,
        events_executed: auto.events_executed,
        events_cancelled: auto.events_cancelled,
        exams_planned: auto.exams_planned,
        exams_completed: 0, // Will be tracked when exam execution is implemented
        post_exam_comms_sent: 0,
        // Report compliance
        report_submitted_by: form.submitted_by_name || 'Via Daily Form',
        report_submitted_at: timeStr,
        instructor_report: 'Filed',
        coach_report: 'Filed',
        ops_report: 'Filed',
        // Team activity
        instructors_active: auto.instructors_active,
        coaches_active: auto.coaches_active,
        program_ops_active: auto.program_ops_active,
        total_calls_made: auto.total_calls_made,
        tickets_resolved: auto.tickets_resolved,
        clicks_shares_sent: 0,
        avg_hours_instructors: 0,
        avg_hours_coaches: 0,
        avg_hours_program_ops: 0,
    };

    await upsertOpsDailyData([row]);

    // Also store the form submission record for compliance tracking
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ops_daily_form_submissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                date DATE NOT NULL,
                university_id UUID NOT NULL,
                university_name TEXT NOT NULL,
                submitted_by UUID NOT NULL,
                submitted_by_name TEXT,
                form_data JSONB,
                auto_data JSONB,
                submitted_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(date, university_id)
            )
        `);
        await db.query(`
            INSERT INTO ops_daily_form_submissions (date, university_id, university_name, submitted_by, submitted_by_name, form_data, auto_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (date, university_id) DO UPDATE SET
                submitted_by = EXCLUDED.submitted_by,
                submitted_by_name = EXCLUDED.submitted_by_name,
                form_data = EXCLUDED.form_data,
                auto_data = EXCLUDED.auto_data,
                submitted_at = NOW()
        `, [form.date, form.university_id, form.university_name, form.submitted_by, form.submitted_by_name,
            JSON.stringify(form), JSON.stringify(auto)]);
    } catch (e: any) {
        console.error('[OPS] Form submission tracking error:', e.message);
    }

    return { row, auto, submitted_at: now.toISOString() };
}

/** Get daily form submission status for compliance tracking */
export async function getDailyFormComplianceStatus(date: string) {
    try {
        const res = await db.query(`
            SELECT
                u.id as university_id,
                COALESCE(u.short_name, u.name) as university_name,
                dfs.submitted_by_name,
                dfs.submitted_at,
                CASE WHEN dfs.id IS NOT NULL THEN true ELSE false END as submitted
            FROM universities u
            LEFT JOIN ops_daily_form_submissions dfs
                ON u.id = dfs.university_id AND dfs.date = $1
            WHERE u.is_team = false
            ORDER BY u.name
        `, [date]);
        return res.rows;
    } catch {
        // Table may not exist yet
        return [];
    }
}

/** Run aggregation for all universities for a given date (used by worker for end-of-day reports) */
export async function aggregateAllUniversities(date: string) {
    const univRes = await db.query(`SELECT id, COALESCE(short_name, name) as name FROM universities WHERE is_team = false ORDER BY name`);
    const results: any[] = [];

    for (const univ of univRes.rows) {
        try {
            const auto = await aggregateOpsForUniversity(univ.id, univ.name, date);
            results.push({ university_id: univ.id, university_name: univ.name, ...auto });
        } catch (e: any) {
            console.error(`[OPS] Aggregation failed for ${univ.name}:`, e.message);
        }
    }

    return results;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────

export function parseOpsCSV(csvText: string, dateOverride?: string): { dailyData: any[]; instructorData: any[] } {
    // Strip BOM and normalize line endings
    const cleanText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split into logical CSV rows (handles newlines inside quoted fields like Remarks)
    const lines = splitCSVRows(cleanText.trim());
    if (lines.length < 2) return { dailyData: [], instructorData: [] };

    // CRITICAL: Use parseCSVLine for headers too (headers with commas in quoted fields break split)
    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    console.log('[OPS_CSV] Headers found:', headers.join(' | '));

    // Build a flexible column lookup — map each header to its column index
    const colIdx: Record<string, number> = {};
    headers.forEach((h, i) => { colIdx[h] = i; });

    // Flexible column finder: try multiple aliases for a field
    function getVal(values: string[], ...aliases: string[]): string {
        for (const alias of aliases) {
            // Exact match
            if (colIdx[alias] !== undefined && values[colIdx[alias]]) return values[colIdx[alias]].trim();
            // Partial match (header contains alias)
            for (const [h, idx] of Object.entries(colIdx)) {
                if (h.includes(alias) && values[idx]) return values[idx].trim();
            }
        }
        return '';
    }
    function getNum(values: string[], ...aliases: string[]): number {
        const v = getVal(values, ...aliases);
        return parseInt(v) || 0;
    }
    function getFloat(values: string[], ...aliases: string[]): number {
        const v = getVal(values, ...aliases);
        return parseFloat(v) || 0;
    }

    const dailyData: any[] = [];
    const instructorData: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue;

        // Detect if this is instructor-level data (exact match only — 'instructor' partial would match 'instructors_total')
        const instrName = (colIdx['instructor_name'] !== undefined && values[colIdx['instructor_name']]?.trim()) || '';
        if (instrName) {
            instructorData.push({
                date: getVal(values, 'date') || dateOverride || new Date().toISOString().split('T')[0],
                university_name: getVal(values, 'university_name', 'university'),
                instructor_name: instrName,
                role: getVal(values, 'role') || 'Instructor',
                teach_sessions_planned: getNum(values, 'teach_sessions_planned'),
                teach_sessions_done: getNum(values, 'teach_sessions_done'),
                practice_sessions_planned: getNum(values, 'practice_sessions_planned'),
                practice_sessions_done: getNum(values, 'practice_sessions_done'),
                hours_logged: getFloat(values, 'hours_logged'),
                calls_made: getNum(values, 'calls_made'),
                tickets_resolved: getNum(values, 'tickets_resolved'),
                clicks_shares_sent: getNum(values, 'clicks_shares_sent'),
            });
        } else {
            const rowDate = dateOverride || getVal(values, 'date') || new Date().toISOString().split('T')[0];
            const uniName = getVal(values, 'university_name', 'university');
            if (!uniName) continue;

            // Detect "Holiday" — if sessions_planned is non-numeric text like "Holiday"
            const rawPlanned = getVal(values, 'sessions_planned', 'planned');
            const isHoliday = rawPlanned && isNaN(parseInt(rawPlanned)) && /holiday/i.test(rawPlanned);
            // Read cancellation_reason and remarks separately, then combine so neither is lost
            const cancelReason = getVal(values, 'cancellation_reason', 'cancel_reason') || null;
            const remarksVal = getVal(values, 'remarks', 'remark') || null;

            // Capture meaningful text placed inside numeric columns (e.g. "CAT 2 Exam", "0(Sports day)")
            const numericFieldDefs: [string, string[]][] = [
                ['Sessions Planned', ['sessions_planned', 'planned']],
                ['Sessions Completed', ['sessions_completed', 'ssions_completed', 'completed', 'done']],
                ['Sessions Cancelled', ['sessions_cancelled', 'ssions_cancelled', 'cancelled']],
                ['Enrolled', ['enrolled', 'total_enrolled', 'students_enrolled']],
                ['Attended', ['attended', 'total_attended', 'students_attended']],
            ];
            const TRIVIAL_VAL = /^(na|n\/a|nil|none|-+|—|\d+)$/i;
            const numericNotes: string[] = [];
            for (const [label, aliases] of numericFieldDefs) {
                const rawVal = getVal(values, ...aliases).trim();
                if (rawVal && !TRIVIAL_VAL.test(rawVal) && /[a-zA-Z]/.test(rawVal)) {
                    numericNotes.push(`${label}: "${rawVal}"`);
                }
            }

            const remarkVal = isHoliday ? 'Holiday'
                : [...[cancelReason, remarksVal].filter(Boolean), ...numericNotes].join(' | ') || null;

            dailyData.push({
                date: rowDate,
                university_name: uniName,
                sessions_planned: getNum(values, 'sessions_planned', 'planned'),
                sessions_completed: getNum(values, 'sessions_completed', 'ssions_completed', 'completed', 'done'),
                sessions_cancelled: getNum(values, 'sessions_cancelled', 'ssions_cancelled', 'cancelled'),
                enrolled: getNum(values, 'enrolled', 'total_enrolled', 'students_enrolled'),
                attended: getNum(values, 'attended', 'total_attended', 'students_attended'),
                coach_calls: getNum(values, 'coach_calls', 'coach_call'),
                parent_calls: getNum(values, 'parent_calls', 'parent_call'),
                instructors_total: getNum(values, 'instructors_total', 'total_instructors', 'instructors'),
                instructors_on_leave: getNum(values, 'instructors_on_leave', 'leave_today', 'on_leave'),
                events_planned: getNum(values, 'events_planned'),
                events_executed: getNum(values, 'events_executed', 'events_done', 'events_completed'),
                events_cancelled: getNum(values, 'events_cancelled'),
                exams_planned: getNum(values, 'exams_planned'),
                exams_completed: getNum(values, 'exams_completed', 'exams_executed', 'exams_done'),
                post_exam_comms_sent: getNum(values, 'post_exam_comms_sent', 'post_exam', 'email_sent'),
                at_risk_total: getNum(values, 'at_risk_total', 'at_risk', 'risk_total'),
                at_risk_informed: getNum(values, 'at_risk_informed', 'risk_informed', 'fail_risk_informed', 'fall_risk_informed'),
                acknowledgments: getNum(values, 'acknowledgments', 'acks', 'parent_acks', 'parent_acks_comms'),
                report_submitted_by: getVal(values, 'report_submitted_by') || null,
                report_submitted_at: getVal(values, 'report_submitted_at') || (getVal(values, 'reports_uploaded') ? '18:00' : null),
                instructor_report: getVal(values, 'instructor_report') || (getVal(values, 'reports_uploaded') ? 'Filed' : 'Missing'),
                coach_report: getVal(values, 'coach_report') || (getVal(values, 'reports_uploaded') ? 'Filed' : 'Missing'),
                ops_report: getVal(values, 'ops_report') || (getVal(values, 'reports_uploaded') ? 'Filed' : 'Missing'),
                instructors_active: getNum(values, 'instructors_active') || getNum(values, 'instructors_total', 'instructors'),
                coaches_active: getNum(values, 'coaches_active'),
                program_ops_active: getNum(values, 'program_ops_active'),
                total_calls_made: getNum(values, 'total_calls_made') || getNum(values, 'coach_calls', 'coach_call'),
                tickets_resolved: getNum(values, 'tickets_resolved'),
                clicks_shares_sent: getNum(values, 'clicks_shares_sent', 'wa_sent'),
                avg_hours_instructors: getFloat(values, 'avg_hours_instructors'),
                avg_hours_coaches: getFloat(values, 'avg_hours_coaches'),
                avg_hours_program_ops: getFloat(values, 'avg_hours_program_ops'),
                cancellation_reason: remarkVal,
            });
        }
    }

    // Log first row for debugging
    if (dailyData.length > 0) {
        const first = dailyData[0];
        console.log(`[OPS_CSV] First row: ${first.university_name} — planned=${first.sessions_planned} completed=${first.sessions_completed} enrolled=${first.enrolled} attended=${first.attended} coach_calls=${first.coach_calls} at_risk=${first.at_risk_total}`);
    }

    return { dailyData, instructorData };
}

// Split CSV text into logical rows, handling newlines inside quoted fields
function splitCSVRows(text: string): string[] {
    const rows: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                current += '""';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
                current += ch;
            } else {
                // Replace newlines inside quotes with space (flatten multi-line cells)
                current += (ch === '\n') ? ' ' : ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                current += ch;
            } else if (ch === '\n') {
                if (current.trim()) rows.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    if (current.trim()) rows.push(current);
    return rows;
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

// ─── Phase 3: Enhanced Analytics ────────────────────────────────────────

/**
 * Task Pattern Analysis — find recurring tasks, frequency, avg completion time
 */
export async function getOpsTaskPatterns(startDate: string, endDate: string, universityId?: string) {
    const univFilter = universityId ? 'AND t.university_id = $3' : '';
    const params: any[] = [startDate, endDate];
    if (universityId) params.push(universityId);

    // Common task patterns grouped by normalized title
    const patternsRes = await db.query(`
        SELECT
            LOWER(TRIM(t.title)) AS normalized_title,
            MIN(t.title) AS title,
            COUNT(*)::int AS frequency,
            COUNT(DISTINCT t.university_id)::int AS universities_seen,
            COUNT(DISTINCT ta.user_id)::int AS assignee_count,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at)) / 3600)::numeric(10,1) AS avg_completion_hours,
            MIN(t.created_at) AS first_seen,
            MAX(t.created_at) AS last_seen,
            SUM(CASE WHEN ta.status = 'COMPLETED' THEN 1 ELSE 0 END)::int AS completed_count,
            SUM(CASE WHEN t.due_date < NOW() AND ta.status != 'COMPLETED' THEN 1 ELSE 0 END)::int AS overdue_count
        FROM tasks t
        LEFT JOIN task_assignees ta ON ta.task_id = t.id
        WHERE t.created_at >= $1::date AND t.created_at <= ($2::date + interval '1 day')
        ${univFilter}
        GROUP BY LOWER(TRIM(t.title))
        ORDER BY frequency DESC
        LIMIT 50
    `, params);

    // Task volume by university per week
    const byTeamRes = await db.query(`
        SELECT
            u.short_name AS university_name,
            DATE_TRUNC('week', t.created_at)::date AS week_start,
            COUNT(*)::int AS task_count,
            SUM(CASE WHEN ta.status = 'COMPLETED' THEN 1 ELSE 0 END)::int AS completed,
            SUM(CASE WHEN t.due_date < NOW() AND ta.status != 'COMPLETED' THEN 1 ELSE 0 END)::int AS overdue,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at)) / 3600)::numeric(10,1) AS avg_hours
        FROM tasks t
        LEFT JOIN task_assignees ta ON ta.task_id = t.id
        LEFT JOIN universities u ON u.id = t.university_id
        WHERE t.created_at >= $1::date AND t.created_at <= ($2::date + interval '1 day')
        ${univFilter}
        GROUP BY u.short_name, DATE_TRUNC('week', t.created_at)
        ORDER BY week_start, u.short_name
    `, params);

    return { patterns: patternsRes.rows, byTeam: byTeamRes.rows };
}

/**
 * Peer Comparison — per-user task metrics + same-task speed comparison
 */
export async function getOpsPeerComparison(startDate: string, endDate: string, universityId?: string) {
    const univFilter = universityId ? 'AND t.university_id = $3' : '';
    const params: any[] = [startDate, endDate];
    if (universityId) params.push(universityId);

    // Per-user metrics
    const usersRes = await db.query(`
        SELECT
            usr.id AS user_id,
            usr.name AS user_name,
            u.short_name AS university_name,
            COUNT(ta.task_id)::int AS total_tasks,
            SUM(CASE WHEN ta.status = 'COMPLETED' THEN 1 ELSE 0 END)::int AS completed,
            SUM(CASE WHEN t.due_date < NOW() AND ta.status != 'COMPLETED' THEN 1 ELSE 0 END)::int AS overdue,
            AVG(CASE WHEN ta.completed_at IS NOT NULL AND ta.started_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at)) / 3600 END)::numeric(10,1) AS avg_hours,
            SUM(CASE WHEN ta.status = 'COMPLETED' AND (ta.completed_at IS NULL OR ta.completed_at <= t.due_date) THEN 1 ELSE 0 END)::int AS on_time_count
        FROM task_assignees ta
        JOIN tasks t ON t.id = ta.task_id
        JOIN users usr ON usr.id = ta.user_id
        LEFT JOIN universities u ON u.id = t.university_id
        WHERE t.created_at >= $1::date AND t.created_at <= ($2::date + interval '1 day')
        ${univFilter}
        GROUP BY usr.id, usr.name, u.short_name
        HAVING COUNT(ta.task_id) >= 1
        ORDER BY completed DESC
    `, params);

    // Same-task comparisons
    const sameTaskRes = await db.query(`
        SELECT
            LOWER(TRIM(t.title)) AS task_key,
            MIN(t.title) AS task_title,
            usr.name AS user_name,
            AVG(EXTRACT(EPOCH FROM (ta.completed_at - ta.started_at)) / 3600)::numeric(10,1) AS avg_hours,
            COUNT(*)::int AS times_done
        FROM task_assignees ta
        JOIN tasks t ON t.id = ta.task_id
        JOIN users usr ON usr.id = ta.user_id
        WHERE ta.status = 'COMPLETED'
            AND ta.completed_at IS NOT NULL AND ta.started_at IS NOT NULL
            AND t.created_at >= $1::date AND t.created_at <= ($2::date + interval '1 day')
            ${univFilter}
        GROUP BY LOWER(TRIM(t.title)), usr.name
        HAVING COUNT(*) >= 1
        ORDER BY task_key, avg_hours
    `, params);

    // Group same-task comparisons
    const sameTaskMap: Record<string, { taskTitle: string; completions: any[] }> = {};
    for (const row of sameTaskRes.rows) {
        if (!sameTaskMap[row.task_key]) {
            sameTaskMap[row.task_key] = { taskTitle: row.task_title, completions: [] };
        }
        sameTaskMap[row.task_key].completions.push({
            user_name: row.user_name,
            avg_hours: parseFloat(row.avg_hours) || 0,
            times_done: row.times_done
        });
    }
    const sameTaskComparisons = Object.values(sameTaskMap).filter(t => t.completions.length > 1);

    return { users: usersRes.rows, sameTaskComparisons };
}

/**
 * University Rankings — composite efficiency score with trend
 */
export async function getOpsUniversityRankings(startDate: string, endDate: string) {
    const res = await db.query(`
        WITH ${UNIV_RESOLVE_CTE}
        SELECT
            cn.canonical_name as university_name,
            SUM(COALESCE(d.sessions_planned, 0))::int AS sessions_planned,
            SUM(COALESCE(d.sessions_completed, 0))::int AS sessions_completed,
            SUM(COALESCE(d.enrolled, 0))::int AS enrolled,
            SUM(COALESCE(d.attended, 0))::int AS attended,
            SUM(COALESCE(d.coach_calls, 0))::int AS coach_calls,
            SUM(COALESCE(d.at_risk_total, 0))::int AS at_risk_total,
            SUM(COALESCE(d.at_risk_informed, 0))::int AS at_risk_informed,
            COUNT(CASE WHEN d.report_submitted_by IS NOT NULL THEN 1 END)::int AS reports_submitted,
            COUNT(*)::int AS total_days,
            SUM(COALESCE(d.events_planned, 0))::int AS events_planned,
            SUM(COALESCE(d.events_executed, 0))::int AS events_executed
        FROM ops_daily_data d
        JOIN canonical_names cn ON cn.raw_name = d.university_name
        WHERE d.date >= $1::date AND d.date <= $2::date
        GROUP BY cn.canonical_name
        ORDER BY cn.canonical_name
    `, [startDate, endDate]);

    const rankings = res.rows.map((r: any) => {
        const sessRate = r.sessions_planned > 0 ? (r.sessions_completed / r.sessions_planned) * 100 : 0;
        const attRate = r.enrolled > 0 ? (r.attended / r.enrolled) * 100 : 0;
        const absent = r.enrolled - r.attended;
        const coachRate = absent > 0 ? Math.min((r.coach_calls / absent) * 100, 100) : 100;
        const riskRate = r.at_risk_total > 0 ? (r.at_risk_informed / r.at_risk_total) * 100 : 100;
        const complianceRate = r.total_days > 0 ? (r.reports_submitted / r.total_days) * 100 : 0;
        const eventRate = r.events_planned > 0 ? (r.events_executed / r.events_planned) * 100 : 100;

        const score = Math.round(
            sessRate * 0.25 + attRate * 0.25 + coachRate * 0.15 +
            riskRate * 0.10 + complianceRate * 0.15 + eventRate * 0.10
        );

        return {
            university_name: canonicalUnivName(r.university_name), score,
            sessRate: Math.round(sessRate), attRate: Math.round(attRate),
            coachRate: Math.round(coachRate), riskRate: Math.round(riskRate),
            complianceRate: Math.round(complianceRate), eventRate: Math.round(eventRate),
            sessions_planned: r.sessions_planned, sessions_completed: r.sessions_completed,
            enrolled: r.enrolled, attended: r.attended, total_days: r.total_days,
        };
    }).sort((a: any, b: any) => b.score - a.score);

    return rankings;
}

/**
 * University Trends — weekly scores for sparklines
 */
export async function getOpsUniversityTrends(universityName: string, weeks: number = 8) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    const res = await db.query(`
        SELECT
            DATE_TRUNC('week', date)::date AS week_start,
            SUM(COALESCE(sessions_planned, 0))::int AS sessions_planned,
            SUM(COALESCE(sessions_completed, 0))::int AS sessions_completed,
            SUM(COALESCE(enrolled, 0))::int AS enrolled,
            SUM(COALESCE(attended, 0))::int AS attended,
            SUM(COALESCE(coach_calls, 0))::int AS coach_calls,
            SUM(COALESCE(at_risk_total, 0))::int AS at_risk_total,
            SUM(COALESCE(at_risk_informed, 0))::int AS at_risk_informed,
            COUNT(CASE WHEN report_submitted_by IS NOT NULL THEN 1 END)::int AS reports_submitted,
            COUNT(*)::int AS total_days
        FROM ops_daily_data
        WHERE university_name = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY DATE_TRUNC('week', date)
        ORDER BY week_start
    `, [universityName, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

    return res.rows.map((r: any) => {
        const sessRate = r.sessions_planned > 0 ? (r.sessions_completed / r.sessions_planned) * 100 : 0;
        const attRate = r.enrolled > 0 ? (r.attended / r.enrolled) * 100 : 0;
        const absent = r.enrolled - r.attended;
        const coachRate = absent > 0 ? Math.min((r.coach_calls / absent) * 100, 100) : 100;
        const riskRate = r.at_risk_total > 0 ? (r.at_risk_informed / r.at_risk_total) * 100 : 100;
        const complianceRate = r.total_days > 0 ? (r.reports_submitted / r.total_days) * 100 : 0;
        const score = Math.round(sessRate * 0.25 + attRate * 0.25 + coachRate * 0.15 + riskRate * 0.10 + complianceRate * 0.15);
        return { week_start: r.week_start, score, sessRate: Math.round(sessRate), attRate: Math.round(attRate) };
    });
}

/**
 * Event + Budget Intelligence — ROI, success metrics, problem patterns
 */
export async function getOpsEventBudgetIntelligence(startDate: string, endDate: string, universityId?: string) {
    const univFilter = universityId ? 'AND bp.university_id = $3' : '';
    const params: any[] = [startDate, endDate];
    if (universityId) params.push(universityId);

    const eventsRes = await db.query(`
        SELECT
            bp.id, bp.title, bp.event_type,
            u.short_name AS university_name,
            bp.expected_attendance, bp.estimated_total_budget,
            bp.approved_total_budget, bp.status, bp.proposed_date,
            bpr.actual_attendance, bpr.actual_budget_used,
            bpr.remaining_budget, bpr.outcomes, bpr.feedback_summary, bpr.issues_faced,
            CASE WHEN bpr.actual_attendance > 0 AND bpr.actual_budget_used > 0
                THEN (bpr.actual_budget_used / bpr.actual_attendance)::numeric(10,2) ELSE NULL END AS cost_per_participant,
            CASE WHEN bp.estimated_total_budget > 0 AND bpr.actual_budget_used IS NOT NULL
                THEN ((bpr.actual_budget_used / bp.estimated_total_budget) * 100)::numeric(5,1) ELSE NULL END AS budget_utilization,
            CASE WHEN bp.expected_attendance > 0 AND bpr.actual_attendance IS NOT NULL
                THEN ((bpr.actual_attendance::numeric / bp.expected_attendance) * 100)::numeric(5,1) ELSE NULL END AS attendance_accuracy
        FROM budget_proposals bp
        LEFT JOIN budget_proposal_reports bpr ON bpr.proposal_id = bp.id
        LEFT JOIN universities u ON u.id = bp.university_id
        WHERE bp.proposed_date >= $1::date AND bp.proposed_date <= ($2::date + interval '1 day')
        ${univFilter}
        ORDER BY bp.proposed_date DESC
    `, params);

    const withReports = eventsRes.rows.filter((r: any) => r.actual_budget_used != null);
    const avgCostPerParticipant = withReports.filter((r: any) => r.cost_per_participant).length > 0
        ? withReports.reduce((s: number, r: any) => s + (parseFloat(r.cost_per_participant) || 0), 0) / withReports.filter((r: any) => r.cost_per_participant).length : 0;
    const avgBudgetUtilization = withReports.filter((r: any) => r.budget_utilization).length > 0
        ? withReports.reduce((s: number, r: any) => s + (parseFloat(r.budget_utilization) || 0), 0) / withReports.filter((r: any) => r.budget_utilization).length : 0;
    const avgAttendanceAccuracy = withReports.filter((r: any) => r.attendance_accuracy).length > 0
        ? withReports.reduce((s: number, r: any) => s + (parseFloat(r.attendance_accuracy) || 0), 0) / withReports.filter((r: any) => r.attendance_accuracy).length : 0;

    const problemPatterns: any[] = [];
    for (const r of eventsRes.rows) {
        if (r.budget_utilization && parseFloat(r.budget_utilization) > 130)
            problemPatterns.push({ type: 'budget_overrun', event: r.title, university: r.university_name, value: `${r.budget_utilization}%`, detail: r.issues_faced });
        if (r.attendance_accuracy && parseFloat(r.attendance_accuracy) < 50)
            problemPatterns.push({ type: 'low_attendance', event: r.title, university: r.university_name, value: `${r.attendance_accuracy}%`, detail: r.issues_faced });
    }

    const byTypeRes = await db.query(`
        SELECT
            bp.event_type,
            COUNT(*)::int AS total_events,
            SUM(CASE WHEN bp.status IN ('EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED') THEN 1 ELSE 0 END)::int AS completed,
            AVG(bpr.actual_budget_used)::numeric(10,2) AS avg_budget,
            AVG(bpr.actual_attendance)::numeric(10,0) AS avg_attendance,
            AVG(CASE WHEN bpr.actual_attendance > 0 AND bpr.actual_budget_used > 0
                THEN bpr.actual_budget_used / bpr.actual_attendance END)::numeric(10,2) AS avg_cost_pp
        FROM budget_proposals bp
        LEFT JOIN budget_proposal_reports bpr ON bpr.proposal_id = bp.id
        WHERE bp.proposed_date >= $1::date AND bp.proposed_date <= ($2::date + interval '1 day')
        ${univFilter}
        GROUP BY bp.event_type
        ORDER BY total_events DESC
    `, params);

    return {
        events: eventsRes.rows,
        aggregates: {
            totalEvents: eventsRes.rows.length,
            eventsWithReports: withReports.length,
            avgCostPerParticipant: Math.round(avgCostPerParticipant * 100) / 100,
            avgBudgetUtilization: Math.round(avgBudgetUtilization),
            avgAttendanceAccuracy: Math.round(avgAttendanceAccuracy),
        },
        problemPatterns,
        byType: byTypeRes.rows,
    };
}

/**
 * External API data upsert — merge external session/attendance data
 */
export async function upsertOpsExternalData(data: {
    university_name: string; date: string;
    sessions_planned?: number; sessions_completed?: number; sessions_cancelled?: number;
    enrolled?: number; attended?: number;
}) {
    await db.query(`
        INSERT INTO ops_daily_data (date, university_name, sessions_planned, sessions_completed, sessions_cancelled, enrolled, attended)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (date, university_name) DO UPDATE SET
            sessions_planned = COALESCE(EXCLUDED.sessions_planned, ops_daily_data.sessions_planned),
            sessions_completed = COALESCE(EXCLUDED.sessions_completed, ops_daily_data.sessions_completed),
            sessions_cancelled = COALESCE(EXCLUDED.sessions_cancelled, ops_daily_data.sessions_cancelled),
            enrolled = COALESCE(EXCLUDED.enrolled, ops_daily_data.enrolled),
            attended = COALESCE(EXCLUDED.attended, ops_daily_data.attended)
    `, [data.date, data.university_name, data.sessions_planned || 0, data.sessions_completed || 0,
        data.sessions_cancelled || 0, data.enrolled || 0, data.attended || 0]);
}

/**
 * NLQ — get table schemas for AI context
 */
export function getOpsTableSchemas(): string {
    return `Available PostgreSQL tables and columns:

TABLE ops_daily_data: date (DATE), university_name (TEXT), sessions_planned (INT), sessions_completed (INT), sessions_cancelled (INT), enrolled (INT), attended (INT), coach_calls (INT), parent_calls (INT), instructors_total (INT), instructors_on_leave (INT), events_planned (INT), events_executed (INT), events_cancelled (INT), exams_planned (INT), exams_completed (INT), post_exam_comms_sent (INT), at_risk_total (INT), at_risk_informed (INT), acknowledgments (INT), report_submitted_by (TEXT). PRIMARY KEY: (date, university_name).

TABLE tasks: id (UUID), title (TEXT), description (TEXT), priority ('URGENT'|'HIGH'|'MEDIUM'|'LOW'), status ('PENDING'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'), assigned_by (UUID FK users), university_id (UUID FK universities), start_date (TIMESTAMPTZ), due_date (TIMESTAMPTZ), created_at (TIMESTAMPTZ).

TABLE task_assignees: task_id (UUID FK tasks), user_id (UUID FK users), status ('PENDING'|'IN_PROGRESS'|'COMPLETED'), started_at (TIMESTAMPTZ), completed_at (TIMESTAMPTZ). PRIMARY KEY: (task_id, user_id).

TABLE schedule_events: id (UUID), university_id (UUID FK universities), title (TEXT), type ('HOLIDAY'|'EXAM'|'EVENT'|'CURRICULAR'|'CO_CURRICULAR'), description (TEXT), status ('ACTIVE'|'COMPLETED'), start_date (TIMESTAMPTZ), due_date (TIMESTAMPTZ), created_at (TIMESTAMPTZ).

TABLE budget_proposals: id (UUID), university_id (UUID FK universities), title (TEXT), event_type (TEXT), expected_attendance (INT), estimated_total_budget (DECIMAL), approved_total_budget (DECIMAL), status (TEXT), proposed_date (TIMESTAMPTZ).

TABLE budget_proposal_reports: id (UUID), proposal_id (UUID FK budget_proposals), actual_attendance (INT), actual_budget_used (DECIMAL), outcomes (TEXT), issues_faced (TEXT).

TABLE users: id (UUID), name (TEXT), email (TEXT), role (TEXT), university_id (UUID FK universities).

TABLE universities: id (UUID), name (TEXT), short_name (TEXT).`;
}

/**
 * NLQ — execute a validated read-only query
 */
export async function executeReadOnlyQuery(sql: string): Promise<{ rows: any[]; rowCount: number }> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('SET LOCAL statement_timeout = 5000');
        await client.query('SET TRANSACTION READ ONLY');
        const result = await client.query(sql);
        await client.query('COMMIT');
        return { rows: result.rows.slice(0, 100), rowCount: result.rowCount || 0 };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
