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
import { fetchSheetTab } from './fee_import';
import { discoverSheetTabs } from './sheet_tabs';

// ── helpers ──────────────────────────────────────────────────────────────

/** Extreme canonical form — same normalization the question-upload dedup uses. */
const canon = (s: unknown): string =>
    String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/s$/, '');

/** Header-key normalizer (case/space/punct-insensitive). */
const nkey = (s: string): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cell(row: Record<string, unknown>, candidates: string[]): string {
    for (const c of candidates) {
        const ck = nkey(c);
        for (const k of Object.keys(row)) {
            if (nkey(k.replace(/__\d+$/, '')) !== ck) continue;
            const v = row[k];
            if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
        }
    }
    return '';
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

function parseSubjectTab(rows: Record<string, unknown>[]): ParsedUnit[] {
    const units = new Map<number, ParsedUnit>();
    let lastNum: number | null = null, lastModName = '', lastTopic = '';
    for (const r of rows) {
        const numRaw = cell(r, ['Module Number', 'Module No', 'Module', 'Unit Number', 'Unit No']);
        let modName = cell(r, ['Module Name', 'Unit Name']);
        let topic = cell(r, ['Topic', 'Topic Name']);
        const session = cell(r, ['Session Name', 'Session', 'Sub Topic', 'Subtopic']);

        // Carry forward values across merged/blank cells.
        const num: number | null = numRaw ? parseInt(numRaw, 10) : lastNum;
        if (numRaw && num != null && Number.isFinite(num)) lastNum = num;
        if (modName) lastModName = modName; else modName = lastModName;
        if (topic) lastTopic = topic; else topic = lastTopic;
        if (num == null || !Number.isFinite(num)) continue;

        if (!units.has(num)) units.set(num, { unit_number: num, name: modName || `Module ${num}`, topics: new Map() });
        const u = units.get(num)!;
        if (modName && (!u.name || u.name === `Module ${num}`)) u.name = modName;

        if (topic) {
            const tk = canon(topic);
            if (tk && !u.topics.has(tk)) u.topics.set(tk, { name: topic, sessions: new Map() });
            const t = tk ? u.topics.get(tk) : undefined;
            if (t && session) {
                const sk = canon(session);
                if (sk && !t.sessions.has(sk)) t.sessions.set(sk, session);
            }
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

interface SubjectRow { id: string; name: string; university: string | null; }

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
    const existingUnits = (await db.query(
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

export async function importPortion(sheetIdOrUrl: string, semester: number, dryRun: boolean): Promise<PortionImportResult> {
    const sheet_id = extractSheetId(sheetIdOrUrl);
    const tabs = await discoverSheetTabs(sheet_id);
    if (tabs.length === 0) throw new Error('Could not read the sheet. Make sure it is shared "Anyone with the link → Viewer".');

    // Load the subject pool once (all subjects at this semester, any university).
    const pool = (await db.query(
        `SELECT s.id, s.name, u.name AS university
           FROM assessment_subjects s
           LEFT JOIN assessment_batches b ON b.id = s.batch_id
           LEFT JOIN universities u ON u.id = b.university_id
          WHERE s.semester = $1`,
        [semester],
    )).rows as SubjectRow[];

    const out: PortionTabResult[] = [];
    for (const tab of tabs) {
        // Skip the non-subject "Course Links" (and similar) tabs.
        if (nkey(tab.name).includes('courselink') || nkey(tab.name) === 'courselinks') {
            out.push({ tab: tab.name, status: 'skipped', detail: 'course-links tab (not a subject)' });
            continue;
        }
        let rows: Record<string, unknown>[];
        try { rows = await fetchSheetTab(sheet_id, tab.name); }
        catch (e: any) { out.push({ tab: tab.name, status: 'error', detail: e?.message || 'fetch failed' }); continue; }

        const parsed = parseSubjectTab(rows);
        const counts = countParsed(parsed);
        if (parsed.length === 0) { out.push({ tab: tab.name, status: 'skipped', detail: 'no Module/Topic rows found' }); continue; }

        const subjects = await matchSubjects(tab.name, semester, pool);
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
