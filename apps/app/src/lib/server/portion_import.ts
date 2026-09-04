/**
 * Examinations — Portion (syllabus) importer from a Google Sheet.
 *
 * Sheet format (one tab per subject; a "Course Links" tab is ignored):
 *   Module Number | Module Name | Topic | Session Name | Unit Links
 *
 * Mapping into the existing portion hierarchy (subject → unit → topic → sub-topic):
 *   Module Number/Name → assessment_units (unit_number, name)
 *   Topic              → assessment_topics (top-level)
 *   Session Name       → assessment_topics sub-topic (parent_topic_id = the Topic)
 * "Unit Links" are intentionally NOT stored (structure-only load).
 *
 * A subject tab is matched to assessment_subjects by canonical name + semester,
 * ACROSS ALL universities that have that subject (so the portion is replicated
 * to every university's copy). Matching falls back to a fuzzy (Levenshtein)
 * best-match to tolerate sheet typos ("AI For Finanace", "Advanced" vs
 * "Advance"). Loading is a non-destructive MERGE (find-or-create) so existing
 * questions attached to units/topics are never deleted.
 *
 * Reuses the generic public-sheet readers fetchSheetTab + discoverSheetTabs.
 */
import { db } from '@uniconnect/shared';
import { fetchSheetTabByGid } from './fee_import';
import { discoverSheetTabs } from './sheet_tabs';

// ── helpers ──────────────────────────────────────────────────────────────

/** Extreme canonical form — same normalization the question-upload dedup uses. */
const canon = (s: unknown): string =>
    String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/s$/, '');

/** Header-key normalizer (case/space/punct-insensitive). */
const nkey = (s: string): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cell(row: Record<string, unknown>, candidates: string[]): string {
    // Pass 1 — exact header match.
    for (const c of candidates) {
        const ck = nkey(c);
        for (const k of Object.keys(row)) {
            if (nkey(k.replace(/__\d+$/, '')) !== ck) continue;
            const v = row[k];
            if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
        }
    }
    // Pass 2 — prefix match, for sheets whose header row has the first data cell
    // merged into it ("Session Name Course Overview"). Restricted to candidates
    // of 8+ chars so short ones like "Module" can't swallow "Module Name".
    for (const c of candidates) {
        if (c.replace(/[^A-Za-z0-9]/g, '').length < 8) continue;
        const ck = nkey(c);
        for (const k of Object.keys(row)) {
            if (!nkey(k.replace(/__\d+$/, '')).startsWith(ck)) continue;
            const v = row[k];
            if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
        }
    }
    return '';
}

/**
 * Module number from whatever the sheet wrote: "3", "Module 3", "Unit 3",
 * "Module III". Roman numerals are accepted because several portion sheets use
 * them; plain parseInt returned NaN and the whole tab was silently skipped.
 */
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(raw: string): number | null {
    const s = raw.toLowerCase();
    if (!/^[ivxlcdm]+$/.test(s)) return null;
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const cur = ROMAN[s[i]], next = ROMAN[s[i + 1]];
        total += next && cur < next ? -cur : cur;
    }
    return total > 0 ? total : null;
}
function moduleNumOf(raw: string): number | null {
    const v = String(raw ?? '').trim();
    if (!v) return null;
    const digits = v.match(/\d+/);
    if (digits) {
        const n = parseInt(digits[0], 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const word = v.replace(/^(module|unit)\s*/i, '').replace(/[^A-Za-z]/g, '');
    return word ? romanToInt(word) : null;
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n; if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
}
function similarity(a: string, b: string): number {
    if (a === b) return 1;
    const max = Math.max(a.length, b.length, 1);
    return 1 - levenshtein(a, b) / max;
}

// ── parse one subject tab ──────────────────────────────────────────────────

interface ParsedSession { name: string; }
interface ParsedTopic { name: string; sessions: Map<string, string>; }
interface ParsedUnit { unit_number: number; name: string; topics: Map<string, ParsedTopic>; }

const MODULE_NUM_KEYS = ['Module Number', 'Module No', 'Module', 'Unit Number', 'Unit No'];
const MODULE_NAME_KEYS = ['Module Name', 'Unit Name'];
const TOPIC_KEYS = ['Topic Name', 'Topic'];
const SESSION_KEYS = ['Session Name', 'Session', 'Sub Topic', 'Subtopic'];

function parseSubjectTab(rows: Record<string, unknown>[]): ParsedUnit[] {
    /*
     * Portion sheets are not uniform, and the two shapes below used to be
     * dropped on the floor:
     *   - no Module column at all  -> every row was skipped (num == null)
     *   - no Topic column at all   -> sessions had nothing to hang off
     * Both are legitimate: a subject may simply be a flat list of sessions.
     * Pre-scan the tab so we know which shape we are dealing with, then fall
     * back sensibly instead of skipping.
     */
    const hasModule = rows.some(r => moduleNumOf(cell(r, MODULE_NUM_KEYS)) != null);
    const hasTopic = rows.some(r => cell(r, TOPIC_KEYS) !== '');

    const units = new Map<number, ParsedUnit>();
    let lastNum: number | null = null, lastModName = '', lastTopic = '';

    for (const r of rows) {
        const numRaw = cell(r, MODULE_NUM_KEYS);
        let modName = cell(r, MODULE_NAME_KEYS);
        let topicRaw = cell(r, TOPIC_KEYS);
        const session = cell(r, SESSION_KEYS);

        // Carry forward values across merged/blank cells.
        const parsedNum = moduleNumOf(numRaw);
        if (parsedNum != null) lastNum = parsedNum;
        // No module column anywhere -> put the whole subject in Module 1.
        const num: number | null = parsedNum ?? lastNum ?? (hasModule ? null : 1);
        if (modName) lastModName = modName; else modName = lastModName;
        if (topicRaw) lastTopic = topicRaw; else topicRaw = lastTopic;
        if (num == null || !Number.isFinite(num)) continue;

        // No Topic column -> the session IS the leaf, so show session names
        // directly under the module rather than losing them.
        const topic = hasTopic ? topicRaw : session;
        const sessionName = hasTopic ? session : '';
        if (!topic) continue;

        const defaultName = hasModule ? `Module ${num}` : '';
        if (!units.has(num)) units.set(num, { unit_number: num, name: modName || defaultName || `Module ${num}`, topics: new Map() });
        const u = units.get(num)!;
        if (modName && (!u.name || u.name === `Module ${num}`)) u.name = modName;

        const tk = canon(topic);
        if (tk && !u.topics.has(tk)) u.topics.set(tk, { name: topic, sessions: new Map() });
        const t = tk ? u.topics.get(tk) : undefined;
        if (t && sessionName) {
            const sk = canon(sessionName);
            if (sk && !t.sessions.has(sk)) t.sessions.set(sk, sessionName);
        }
    }
    return Array.from(units.values()).sort((a, b) => a.unit_number - b.unit_number);
}

function countParsed(units: ParsedUnit[]) {
    let topics = 0, sessions = 0;
    for (const u of units) { topics += u.topics.size; for (const t of u.topics.values()) sessions += t.sessions.size; }
    return { modules: units.length, topics, sessions };
}

// ── subject matching (all universities) ─────────────────────────────────────

interface SubjectRow { id: string; name: string; university: string | null; university_id?: string | null; }

async function matchSubjects(tabName: string, semester: number, pool: SubjectRow[]): Promise<SubjectRow[]> {
    const target = canon(tabName);
    if (!target) return [];
    const exact = pool.filter(s => canon(s.name) === target);
    if (exact.length > 0) return exact;
    // Fuzzy fallback: find the closest existing subject name, then take ALL
    // subjects sharing that (canonical) name so every university's copy loads.
    let best: { canonName: string; score: number } | null = null;
    for (const s of pool) {
        const sc = similarity(canon(s.name), target);
        if (sc >= 0.82 && (!best || sc > best.score)) best = { canonName: canon(s.name), score: sc };
    }
    if (best) return pool.filter(s => canon(s.name) === best!.canonName);
    return [];
}

// ── load portion into one subject (find-or-create merge) ────────────────────

interface LoadStats {
    subject: string; university: string | null;
    units_created: number; units_existing: number;
    topics_created: number; topics_existing: number;
    sessions_created: number; sessions_existing: number;
}

async function loadPortionIntoSubject(subject: SubjectRow, parsed: ParsedUnit[], dryRun: boolean): Promise<LoadStats> {
    const st: LoadStats = {
        subject: subject.name, university: subject.university,
        units_created: 0, units_existing: 0, topics_created: 0, topics_existing: 0, sessions_created: 0, sessions_existing: 0,
    };
    const existingUnits = subject.id === '__dry__'
        ? [] as Array<{ id: string; unit_number: number; name: string }>
        : (await db.query(
            'SELECT id, unit_number, name FROM assessment_units WHERE subject_id = $1', [subject.id],
        )).rows as Array<{ id: string; unit_number: number; name: string }>;

    for (const pu of parsed) {
        let unit = existingUnits.find(u => Number(u.unit_number) === pu.unit_number);
        let unitId: string;
        if (!unit) {
            st.units_created++;
            if (!dryRun) {
                const r = await db.query('INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1,$2,$3) RETURNING id', [subject.id, pu.unit_number, pu.name]);
                unitId = r.rows[0].id; existingUnits.push({ id: unitId, unit_number: pu.unit_number, name: pu.name });
            } else { unitId = '__dry__'; }
        } else { st.units_existing++; unitId = unit.id; }

        // Existing topics for this unit (empty for a just-created / dry unit).
        const existingTopics = unitId === '__dry__'
            ? [] as Array<{ id: string; name: string; parent_topic_id: string | null }>
            : (await db.query('SELECT id, name, parent_topic_id FROM assessment_topics WHERE unit_id = $1', [unitId])).rows as Array<{ id: string; name: string; parent_topic_id: string | null }>;

        for (const t of pu.topics.values()) {
            const tk = canon(t.name);
            let topic = existingTopics.find(x => !x.parent_topic_id && canon(x.name) === tk);
            let topicId: string;
            if (!topic) {
                st.topics_created++;
                if (!dryRun && unitId !== '__dry__') {
                    const r = await db.query('INSERT INTO assessment_topics (unit_id, name) VALUES ($1,$2) RETURNING id', [unitId, t.name]);
                    topicId = r.rows[0].id; existingTopics.push({ id: topicId, name: t.name, parent_topic_id: null });
                } else { topicId = '__dry__'; }
            } else { st.topics_existing++; topicId = topic.id; }

            for (const sname of t.sessions.values()) {
                const sk = canon(sname);
                const sess = existingTopics.find(x => x.parent_topic_id === topicId && canon(x.name) === sk);
                if (!sess) {
                    st.sessions_created++;
                    if (!dryRun && unitId !== '__dry__' && topicId !== '__dry__') {
                        const r = await db.query('INSERT INTO assessment_topics (unit_id, name, parent_topic_id) VALUES ($1,$2,$3) RETURNING id', [unitId, sname, topicId]);
                        existingTopics.push({ id: r.rows[0].id, name: sname, parent_topic_id: topicId });
                    }
                } else { st.sessions_existing++; }
            }
        }
    }
    return st;
}

// ── top-level import ─────────────────────────────────────────────────────────

export interface PortionTabResult {
    tab: string;
    status: 'loaded' | 'unmatched' | 'skipped' | 'error';
    detail?: string;
    modules?: number; topics?: number; sessions?: number;
    matched_subjects?: number;
    subjects?: LoadStats[];
}
export interface PortionImportResult {
    sheet_id: string; semester: number; dry_run: boolean;
    tabs: PortionTabResult[];
}

export function extractSheetId(raw: string): string {
    const s = (raw || '').trim();
    const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return s; // already an ID
}

/** Optional scoping for a portion load. */
export interface PortionImportOptions {
    /** Restrict the load to these universities (default: every university). */
    universityIds?: string[];
    /** Create the subject at this semester where a scoped university lacks it. */
    createMissing?: boolean;
}

/**
 * A branch to hang a newly-created subject off, creating a General
 * batch/branch when the university has none. Mirrors the bulk question-bank
 * uploader so both importers place new subjects the same way.
 */
async function branchForUniversity(uniId: string, dryRun: boolean): Promise<{ branchId: string; batchId: string | null } | null> {
    const existing = (await db.query(
        `SELECT id, batch_id FROM assessment_branches WHERE university_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [uniId],
    )).rows[0];
    if (existing) return { branchId: existing.id, batchId: existing.batch_id ?? null };
    if (dryRun) return null;

    let batch = (await db.query(
        `SELECT id FROM assessment_batches WHERE university_id = $1 ORDER BY created_at ASC LIMIT 1`, [uniId],
    )).rows[0];
    if (!batch) {
        batch = (await db.query(
            `INSERT INTO assessment_batches (university_id, name) VALUES ($1, 'General') RETURNING id`, [uniId],
        )).rows[0];
    }
    const br = (await db.query(
        `INSERT INTO assessment_branches (university_id, batch_id, name, code) VALUES ($1,$2,'General','GEN') RETURNING id`,
        [uniId, batch.id],
    )).rows[0];
    return { branchId: br.id, batchId: batch.id };
}

export async function importPortion(
    sheetIdOrUrl: string,
    semester: number,
    dryRun: boolean,
    opts: PortionImportOptions = {},
): Promise<PortionImportResult> {
    const sheet_id = extractSheetId(sheetIdOrUrl);
    const tabs = await discoverSheetTabs(sheet_id);
    if (tabs.length === 0) throw new Error('Could not read the sheet. Make sure it is shared "Anyone with the link → Viewer".');

    const scoped = (opts.universityIds || []).filter(Boolean);
    const scopeSet = new Set(scoped);

    // Load the subject pool once. Scoped to the given universities when asked.
    const pool = (await db.query(
        scoped.length
            ? `SELECT s.id, s.name, u.name AS university, u.id AS university_id
                 FROM assessment_subjects s
                 JOIN assessment_branches b ON b.id = s.branch_id
                 JOIN universities u ON u.id = b.university_id
                WHERE s.semester = $1 AND u.id = ANY($2::uuid[])`
            : `SELECT s.id, s.name, u.name AS university, u.id AS university_id
                 FROM assessment_subjects s
                 LEFT JOIN assessment_batches b ON b.id = s.batch_id
                 LEFT JOIN universities u ON u.id = b.university_id
                WHERE s.semester = $1`,
        scoped.length ? [semester, scoped] : [semester],
    )).rows as SubjectRow[];

    const out: PortionTabResult[] = [];
    for (const tab of tabs) {
        // Skip the non-subject "Course Links" (and similar) tabs.
        if (nkey(tab.name).includes('courselink') || nkey(tab.name) === 'courselinks') {
            out.push({ tab: tab.name, status: 'skipped', detail: 'course-links tab (not a subject)' });
            continue;
        }
        let rows: Record<string, unknown>[];
        // Fetch by gid, not name — discoverSheetTabs trims names, so tabs with a
        // trailing space ("Logical Reasoning ") would fail gviz's exact
        // name match and return 0 rows.
        try { rows = await fetchSheetTabByGid(sheet_id, tab.gid); }
        catch (e: any) { out.push({ tab: tab.name, status: 'error', detail: e?.message || 'fetch failed' }); continue; }

        const parsed = parseSubjectTab(rows);
        const counts = countParsed(parsed);
        if (parsed.length === 0) { out.push({ tab: tab.name, status: 'skipped', detail: 'no Module/Topic rows found' }); continue; }

        const subjects = await matchSubjects(tab.name, semester, pool);

        // Create the subject for any scoped university that does not have it, so
        // a new semester can be set up without hand-making 6 subjects per campus.
        if (opts.createMissing && scopeSet.size) {
            const have = new Set(subjects.map(s => String(s.university_id ?? '')));
            for (const uniId of scopeSet) {
                if (have.has(uniId)) continue;
                const home = await branchForUniversity(uniId, dryRun);
                if (!home) { // dry run with no branch yet
                    subjects.push({ id: '__dry__', name: tab.name.trim(), university: null, university_id: uniId });
                    continue;
                }
                if (dryRun) {
                    subjects.push({ id: '__dry__', name: tab.name.trim(), university: null, university_id: uniId });
                    continue;
                }
                const created = (await db.query(
                    `INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester)
                     VALUES ($1,$2,$3,'',$4) RETURNING id`,
                    [home.branchId, home.batchId, tab.name.trim(), semester],
                )).rows[0];
                const uname = (await db.query(`SELECT name FROM universities WHERE id = $1`, [uniId])).rows[0]?.name ?? null;
                const row: SubjectRow = { id: created.id, name: tab.name.trim(), university: uname, university_id: uniId };
                subjects.push(row);
                pool.push(row);
            }
        }

        if (subjects.length === 0) {
            out.push({ tab: tab.name, status: 'unmatched', detail: `no Semester ${semester} subject matches this tab name`, ...counts });
            continue;
        }
        const perSubject: LoadStats[] = [];
        for (const s of subjects) perSubject.push(await loadPortionIntoSubject(s, parsed, dryRun));
        out.push({ tab: tab.name, status: 'loaded', ...counts, matched_subjects: subjects.length, subjects: perSubject });
    }

    return { sheet_id, semester, dry_run: dryRun, tabs: out };
}
