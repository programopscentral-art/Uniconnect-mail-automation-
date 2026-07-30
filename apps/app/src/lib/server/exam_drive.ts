/**
 * Exam-paper → Google Drive sync.
 *
 * When an exam paper is saved, its rendered PDF(s) are uploaded into a
 * Google Drive folder tree organised as:
 *
 *     <root> / "<Uni> University" / "<Uni> <Batch> Batch" / "<Uni> Semester <N> Graded Assessments"
 *
 * (the pattern mirrors the manually-created "CDU University / CDU 2026-2030
 * Batch / CDU Semester 1 Graded Assessments" example — but folder names are
 * derived deterministically from each paper's real university / batch /
 * semester, so they always match the paper being saved). Missing folders are
 * created automatically.
 *
 * AUTH: a single shared OAuth connection, authorised ONCE by the Drive folder's
 * owner (programopscentral@nxtwave.in). We store that account's encrypted
 * refresh token and upload as them — files land in their My Drive, so no
 * Shared Drive or service account is needed. Reuses the existing
 * GOOGLE_CLIENT_ID/SECRET + encryptString/decryptString plumbing.
 *
 * Only papers that use a deterministic template (layout_schema.slots) can be
 * rendered server-side; others are skipped with a clear reason.
 */
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';
import { db, encryptString, decryptString } from '@uniconnect/shared';
import { DeterministicRenderer } from './services/deterministic-renderer';

// encryptString/decryptString read the key from process.env.
process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

export const EXAM_DRIVE_ROOT_FOLDER_ID = '1fCUSJ4lgxnFQl5H26vZkaAaZw3_n-EHm';
const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
];

function driveRedirectUri(): string {
    return (
        env.GOOGLE_DRIVE_REDIRECT_URI ||
        env.GOOGLE_SHEETS_REDIRECT_URI?.replace(/\/api\/sheets\/google\/callback/, '/api/assessments/drive/callback') ||
        env.GOOGLE_GMAIL_REDIRECT_URI?.replace('mailboxes', 'assessments/drive') ||
        'http://localhost:3001/api/assessments/drive/callback'
    );
}

function oauthClient() {
    return new google.auth.OAuth2(
        (env.GOOGLE_CLIENT_ID || '').trim(),
        (env.GOOGLE_CLIENT_SECRET || '').trim(),
        driveRedirectUri(),
    );
}

export function getExamDriveAuthUrl(userId: string): string {
    return oauthClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // force refresh_token
        scope: DRIVE_SCOPES,
        state: userId,
        redirect_uri: driveRedirectUri(),
    });
}

// Singleton connection row. Created lazily (references only itself).
async function ensureTable(): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS exam_drive_connection (
            id                int PRIMARY KEY DEFAULT 1,
            google_email      text,
            refresh_token_enc text,
            root_folder_id    text NOT NULL DEFAULT '${EXAM_DRIVE_ROOT_FOLDER_ID}',
            connected_by      uuid,
            connected_at      timestamptz DEFAULT now(),
            updated_at        timestamptz DEFAULT now(),
            CONSTRAINT exam_drive_singleton CHECK (id = 1)
        );
    `);
}

export async function saveExamDriveTokens(code: string, userId: string): Promise<{ email: string }> {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error('Google did not return a refresh token. Remove UniConnect from your Google account permissions and try connecting again.');
    }
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();

    await ensureTable();
    await db.query(
        `INSERT INTO exam_drive_connection (id, google_email, refresh_token_enc, connected_by, connected_at, updated_at)
         VALUES (1, $1, $2, $3, now(), now())
         ON CONFLICT (id) DO UPDATE SET
            google_email = EXCLUDED.google_email,
            refresh_token_enc = EXCLUDED.refresh_token_enc,
            connected_by = EXCLUDED.connected_by,
            updated_at = now()`,
        [data.email ?? null, encryptString(tokens.refresh_token), userId],
    );
    return { email: data.email ?? '' };
}

export async function getExamDriveStatus(): Promise<{ connected: boolean; email?: string; connected_at?: string }> {
    await ensureTable();
    const r = await db.query(
        `SELECT google_email, connected_at::text AS connected_at
           FROM exam_drive_connection WHERE id = 1 AND refresh_token_enc IS NOT NULL`,
    );
    if (r.rows.length === 0) return { connected: false };
    return { connected: true, email: r.rows[0].google_email, connected_at: r.rows[0].connected_at };
}

async function getDrive() {
    await ensureTable();
    const r = await db.query(`SELECT refresh_token_enc FROM exam_drive_connection WHERE id = 1`);
    const enc = r.rows[0]?.refresh_token_enc;
    if (!enc) return null;
    const client = oauthClient();
    client.setCredentials({ refresh_token: decryptString(enc) });
    return google.drive({ version: 'v3', auth: client });
}

// ── Folder + upload helpers ──────────────────────────────────────────────

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const folderKey = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// List the parent's subfolders and match by normalized name (trim + case +
// collapsed whitespace) so we REUSE the existing manually-created folders even
// when their names have quirks like a trailing space ("Logical Reasoning ") or
// different casing ("Ai for Finance"). Only creates a new folder when none
// matches — avoids duplicate folders.
async function findOrCreateFolder(drive: any, name: string, parentId: string): Promise<string> {
    const target = folderKey(name);
    const res = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
        fields: 'files(id,name)', pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    const hit = (res.data.files || []).find((f: any) => folderKey(f.name) === target);
    if (hit) return hit.id!;
    const created = await drive.files.create({
        requestBody: { name: name.trim(), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id', supportsAllDrives: true,
    });
    return created.data.id!;
}

// exam_type → the assessment-type folder used in Drive.
const EXAM_TYPE_FOLDER: Record<string, string> = {
    MID1: 'MID 1 Assessments',
    MID2: 'MID 2 Assessments',
    SEM: 'End Sem Assessments',
};

// Full Drive folder path for a paper:
//   <Uni> University / <Uni> <Batch> Batch / <Uni> Semester <N> Graded Assessments
//     / <MID 1 Assessments|...> / <Subject>
function paperFolderPath(paper: { uni_label: string; batch_name?: string | null; semester?: number | null; exam_type?: string | null; subject_name?: string | null }): string[] {
    const uni = String(paper.uni_label).trim();
    const batch = String(paper.batch_name || 'Unknown Batch').trim();
    const sem = paper.semester != null ? paper.semester : '?';
    const examType = String(paper.exam_type || '').toUpperCase();
    const examFolder = EXAM_TYPE_FOLDER[examType] || `${paper.exam_type || 'Assessment'} Assessments`;
    const subjectFolder = String(paper.subject_name || 'General').trim();
    return [
        `${uni} University`,
        `${uni} ${batch} Batch`,
        `${uni} Semester ${sem} Graded Assessments`,
        examFolder,
        subjectFolder,
    ];
}

async function ensureFolderPath(drive: any, rootId: string, names: string[]): Promise<string> {
    let parent = rootId;
    for (const n of names) parent = await findOrCreateFolder(drive, n, parent);
    return parent;
}

async function uploadOrReplacePdf(drive: any, folderId: string, filename: string, buffer: Buffer): Promise<string> {
    const q = `name = '${esc(filename)}' and '${folderId}' in parents and trashed = false`;
    const existing = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true });
    const media = { mimeType: 'application/pdf', body: Readable.from(buffer) };
    if (existing.data.files?.length) {
        const fileId = existing.data.files[0].id!;
        await drive.files.update({ fileId, media, supportsAllDrives: true });
        return fileId;
    }
    const created = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media, fields: 'id', supportsAllDrives: true,
    });
    return created.data.id!;
}

// ── Render one set to a PDF buffer (mirrors papers/[id]/render) ───────────

async function renderSetToBuffer(paper: any, setsData: any, setName: string): Promise<Buffer | null> {
    if (!paper.layout_schema || !paper.layout_schema.slots) return null;
    const setData = setsData[setName] || setsData[setName.toLowerCase()] || setsData[setName.toUpperCase()];
    if (!setData || !Array.isArray(setData.questions)) return null;

    const coRes = await db.query(
        'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
        [paper.subject_id],
    );

    const renderData: Record<string, any> = {};
    const isVGU = paper.layout_schema?.style === 'vgu';
    for (const slot of setData.questions) {
        if (!slot.slot_id) continue;
        if (isVGU) { renderData[slot.slot_id] = slot; continue; }
        if (slot.type === 'OR_GROUP') {
            const q1 = slot.questions?.[0]?.text || slot.choice1?.questions?.[0]?.text || '';
            const q2 = slot.choice2?.questions?.[0]?.text || '';
            renderData[slot.slot_id] = q1 + (q2 ? ` \nOR\n ` + q2 : '');
        } else {
            renderData[slot.slot_id] = slot.questions?.[0]?.text || slot.text || '';
        }
    }
    const meta = setsData.metadata || setsData.editor_metadata || {};
    renderData['exam_title'] = meta.exam_title || paper.exam_title || '';
    renderData['subject_name'] = paper.subject_name || meta.subject_name || '';
    renderData['max_marks'] = String(paper.max_marks || meta.max_marks || '');
    renderData['duration'] = String(paper.duration_minutes || meta.duration_minutes || '');
    renderData['course_code'] = meta.course_code || '';
    renderData['paper_date'] = meta.paper_date || '';
    renderData['course_outcomes'] = coRes.rows;

    return DeterministicRenderer.renderToBuffer(paper.layout_schema, renderData);
}

/**
 * Upload a CLIENT-rendered PDF for one set into the paper's Drive folder.
 *
 * Most paper formats (CDU/Chaitanya, Crescent, generic, …) only exist as
 * browser-rendered HTML and are "printed" client-side — there is no
 * server-side PDF for them. So the editor captures the rendered paper to a PDF
 * in the browser and posts it here; we just route it to the right folder. This
 * works for EVERY paper type (no deterministic template required).
 */
export async function uploadPaperPdf(paperId: string, setLabel: string, pdf: Buffer): Promise<DriveSyncResult> {
    try {
        const drive = await getDrive();
        if (!drive) return { ok: false, reason: 'not_connected', message: 'Exam-papers Drive is not connected yet.' };

        const { rows } = await db.query(
            `SELECT p.exam_type, p.semester,
                    COALESCE(u.short_name, u.name) AS uni_label,
                    b.name AS batch_name,
                    s.name AS subject_name
               FROM assessment_papers p
               LEFT JOIN universities u ON u.id = p.university_id
               LEFT JOIN assessment_batches b ON b.id = p.batch_id
               LEFT JOIN assessment_subjects s ON s.id = p.subject_id
              WHERE p.id = $1`,
            [paperId],
        );
        if (rows.length === 0) return { ok: false, reason: 'paper_not_found' };
        const paper = rows[0];
        if (!paper.uni_label) return { ok: false, reason: 'no_university', message: 'Paper has no university set — cannot route to a Drive folder.' };

        const pathNames = paperFolderPath(paper);
        const folderId = await ensureFolderPath(drive, EXAM_DRIVE_ROOT_FOLDER_ID, pathNames);

        const safeSubject = String(paper.subject_name || 'Paper').replace(/[\\/:*?"<>|]/g, '-').trim();
        const fname = `${safeSubject} - ${paper.exam_type || 'Exam'} - Set ${String(setLabel).toUpperCase()}.pdf`;
        const fileId = await uploadOrReplacePdf(drive, folderId, fname, pdf);
        return { ok: true, folder_path: pathNames.join(' / '), uploaded: [{ set: String(setLabel).toUpperCase(), file_id: fileId, name: fname }] };
    } catch (e: any) {
        console.error('[EXAM_DRIVE] uploadPaperPdf failed:', e?.message);
        return { ok: false, reason: 'error', message: e?.message || 'Drive upload failed' };
    }
}

export interface DriveSyncResult {
    ok: boolean;
    reason?: 'not_connected' | 'paper_not_found' | 'no_university' | 'no_template' | 'no_sets_rendered' | 'error';
    message?: string;
    folder_path?: string;
    uploaded?: Array<{ set: string; file_id: string; name: string }>;
}

/**
 * Render every set of a paper and upload each as a PDF into the correct
 * university/batch/semester Drive folder. Non-throwing — returns a reason on
 * failure so the caller (Save) can surface it without breaking the save.
 */
export async function syncPaperToDrive(paperId: string): Promise<DriveSyncResult> {
    try {
        const drive = await getDrive();
        if (!drive) return { ok: false, reason: 'not_connected', message: 'Exam-papers Drive is not connected yet.' };

        const { rows } = await db.query(
            `SELECT p.*, t.layout_schema,
                    COALESCE(u.short_name, u.name) AS uni_label,
                    b.name AS batch_name,
                    s.name AS subject_name
               FROM assessment_papers p
               LEFT JOIN assessment_templates t ON t.id = p.template_id
               LEFT JOIN universities u ON u.id = p.university_id
               LEFT JOIN assessment_batches b ON b.id = p.batch_id
               LEFT JOIN assessment_subjects s ON s.id = p.subject_id
              WHERE p.id = $1`,
            [paperId],
        );
        if (rows.length === 0) return { ok: false, reason: 'paper_not_found' };
        const paper = rows[0];
        if (!paper.uni_label) return { ok: false, reason: 'no_university', message: 'Paper has no university set — cannot route to a Drive folder.' };
        if (!paper.layout_schema || !paper.layout_schema.slots) return { ok: false, reason: 'no_template', message: 'Paper does not use a deterministic template, so it cannot be rendered to PDF for Drive.' };

        const pathNames = paperFolderPath(paper);
        const folderId = await ensureFolderPath(drive, EXAM_DRIVE_ROOT_FOLDER_ID, pathNames);

        const setsData = typeof paper.sets_data === 'string' ? JSON.parse(paper.sets_data) : (paper.sets_data || {});
        const setNames = Object.keys(setsData).filter((k) => /^[A-D]$/i.test(k));
        const targets = setNames.length ? setNames : ['A'];

        const safeSubject = String(paper.subject_name || 'Paper').replace(/[\\/:*?"<>|]/g, '-').trim();
        const uploaded: DriveSyncResult['uploaded'] = [];
        for (const setName of targets) {
            const buf = await renderSetToBuffer(paper, setsData, setName);
            if (!buf) continue;
            const fname = `${safeSubject} - ${paper.exam_type || 'Exam'} - Set ${setName.toUpperCase()}.pdf`;
            const fid = await uploadOrReplacePdf(drive, folderId, fname, buf);
            uploaded.push({ set: setName.toUpperCase(), file_id: fid, name: fname });
        }
        if (uploaded.length === 0) return { ok: false, reason: 'no_sets_rendered', message: 'No sets could be rendered to PDF.' };
        return { ok: true, folder_path: pathNames.join(' / '), uploaded };
    } catch (e: any) {
        console.error('[EXAM_DRIVE] syncPaperToDrive failed:', e?.message);
        return { ok: false, reason: 'error', message: e?.message || 'Drive upload failed' };
    }
}
