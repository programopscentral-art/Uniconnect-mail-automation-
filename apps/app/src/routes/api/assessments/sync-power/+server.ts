import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    // Auth check: Admin or Program Ops only
    const userRole = locals.user.role as string;
    if (userRole !== 'ADMIN' && userRole !== 'PROGRAM_OPS') {
        throw error(403, 'Only Central Ops can perform Universal Sync');
    }

    const { sourceSubjectId, targetBatchName, targetUniversityIds, syncQuestionBank } = await request.json();

    if (!sourceSubjectId || !targetBatchName || !targetUniversityIds?.length) {
        throw error(400, 'Missing required fields');
    }

    try {
        // 1. Get Source Subject Info
        const { rows: [sourceSubject] } = await db.query(`
            SELECT s.*, b.name as branch_name 
            FROM assessment_subjects s
            JOIN assessment_branches b ON s.branch_id = b.id
            WHERE s.id = $1
        `, [sourceSubjectId]);

        if (!sourceSubject) throw error(404, 'Source subject not found');

        // 2. Fetch Source Content
        const { rows: units } = await db.query('SELECT * FROM assessment_units WHERE subject_id = $1', [sourceSubjectId]);
        const unitIds = units.map(u => u.id);
        const { rows: topics } = unitIds.length > 0
            ? await db.query('SELECT * FROM assessment_topics WHERE unit_id = ANY($1)', [unitIds])
            : { rows: [] };
        const { rows: practicals } = await db.query('SELECT * FROM assessment_practicals WHERE subject_id = $1', [sourceSubjectId]);
        const { rows: cos } = await db.query('SELECT * FROM assessment_course_outcomes WHERE subject_id = $1', [sourceSubjectId]);

        const { rows: questions } = syncQuestionBank && unitIds.length > 0
            ? await db.query(`
                SELECT * FROM assessment_questions 
                WHERE unit_id IN (SELECT id FROM assessment_units WHERE subject_id = $1)
            `, [sourceSubjectId])
            : { rows: [] };

        console.log(`[UniversalSync] Starting sync for ${targetUniversityIds.length} hubs. Source: ${sourceSubject.name} (${questions.length} questions)`);

        // Multi-row INSERT helper — one round-trip for a whole table instead of
        // one query per row. Postgres returns RETURNING rows in VALUES order, so
        // callers map source[i] -> returned[i].
        async function bulkInsert(table: string, columns: string[], rowsData: any[][], returning = 'id'): Promise<any[]> {
            if (rowsData.length === 0) return [];
            const ncol = columns.length;
            const placeholders = rowsData
                .map((_, i) => '(' + columns.map((__, j) => '$' + (i * ncol + j + 1)).join(',') + ')')
                .join(',');
            const flat: any[] = [];
            for (const r of rowsData) flat.push(...r);
            const q = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}` + (returning ? ` RETURNING ${returning}` : '');
            const { rows } = await db.query(q, flat);
            return rows;
        }

        const rootTopics = topics.filter(t => !t.parent_topic_id);
        const subTopics = topics.filter(t => t.parent_topic_id);

        async function syncOneUniversity(uniId: string) {
            // a. Find or create target batch
            let { rows: [targetBatch] } = await db.query(
                'SELECT id FROM assessment_batches WHERE university_id = $1 AND name = $2', [uniId, targetBatchName]);
            if (!targetBatch) {
                ({ rows: [targetBatch] } = await db.query(
                    'INSERT INTO assessment_batches (university_id, name) VALUES ($1, $2) RETURNING id', [uniId, targetBatchName]));
            }
            // b. Find or create target branch
            let { rows: [targetBranch] } = await db.query(
                'SELECT id FROM assessment_branches WHERE university_id = $1 AND name = $2 AND batch_id = $3',
                [uniId, sourceSubject.branch_name, targetBatch.id]);
            if (!targetBranch) {
                ({ rows: [targetBranch] } = await db.query(
                    'INSERT INTO assessment_branches (university_id, name, batch_id) VALUES ($1, $2, $3) RETURNING id',
                    [uniId, sourceSubject.branch_name, targetBatch.id]));
            }
            // c. Find or create target subject (wipe existing portion for a clean copy)
            let { rows: [targetSubject] } = await db.query(
                'SELECT id FROM assessment_subjects WHERE branch_id = $1 AND name = $2 AND batch_id = $3',
                [targetBranch.id, sourceSubject.name, targetBatch.id]);
            if (!targetSubject) {
                ({ rows: [targetSubject] } = await db.query(
                    'INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester, difficulty_levels) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                    [targetBranch.id, targetBatch.id, sourceSubject.name, sourceSubject.code, sourceSubject.semester, sourceSubject.difficulty_levels]));
            } else {
                // CASCADE from units clears topics + questions.
                await Promise.all([
                    db.query('DELETE FROM assessment_units WHERE subject_id = $1', [targetSubject.id]),
                    db.query('DELETE FROM assessment_practicals WHERE subject_id = $1', [targetSubject.id]),
                    db.query('DELETE FROM assessment_course_outcomes WHERE subject_id = $1', [targetSubject.id]),
                ]);
            }
            const sid = targetSubject.id;

            // d. Copy portion — one bulk INSERT per table.
            const newUnits = await bulkInsert('assessment_units', ['subject_id', 'unit_number', 'name'],
                units.map(u => [sid, u.unit_number, u.name]));
            const unitMap = new Map<string, string>();
            units.forEach((u, i) => unitMap.set(u.id, newUnits[i].id));

            const rt = rootTopics.filter(t => unitMap.has(t.unit_id));
            const newRoot = await bulkInsert('assessment_topics', ['unit_id', 'name'],
                rt.map(t => [unitMap.get(t.unit_id), t.name]));
            const topicMap = new Map<string, string>();
            rt.forEach((t, i) => topicMap.set(t.id, newRoot[i].id));

            const st = subTopics.filter(t => unitMap.has(t.unit_id) && topicMap.has(t.parent_topic_id));
            if (st.length) await bulkInsert('assessment_topics', ['unit_id', 'name', 'parent_topic_id'],
                st.map(t => [unitMap.get(t.unit_id), t.name, topicMap.get(t.parent_topic_id)]), '');

            if (practicals.length) await bulkInsert('assessment_practicals', ['subject_id', 'name', 'description'],
                practicals.map(p => [sid, p.name, p.description]), '');

            const newCos = await bulkInsert('assessment_course_outcomes', ['subject_id', 'code', 'description'],
                cos.map(c => [sid, c.code, c.description]));
            const coMap = new Map<string, string>();
            cos.forEach((c, i) => coMap.set(c.id, newCos[i].id));

            if (syncQuestionBank && questions.length > 0) {
                await bulkInsert('assessment_questions',
                    ['topic_id', 'unit_id', 'co_id', 'question_text', 'bloom_level', 'difficulty', 'marks', 'type', 'options', 'answer_key', 'image_url', 'explanation', 'is_important'],
                    questions.map(q => [
                        q.topic_id ? topicMap.get(q.topic_id) ?? null : null,
                        q.unit_id ? unitMap.get(q.unit_id) ?? null : null,
                        q.co_id ? coMap.get(q.co_id) ?? null : null,
                        q.question_text, q.bloom_level, q.difficulty || 'MEDIUM', q.marks, q.type,
                        typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
                        q.answer_key, q.image_url, q.explanation, q.is_important || false,
                    ]), '');
            }
        }

        // 3. Sync universities in parallel batches (each is independent).
        const results: any[] = [];
        const CONCURRENCY = 6;
        for (let i = 0; i < targetUniversityIds.length; i += CONCURRENCY) {
            const batch = targetUniversityIds.slice(i, i + CONCURRENCY);
            const settled = await Promise.all(batch.map((uid: string) =>
                syncOneUniversity(uid).then(() => ({ uniId: uid, status: 'success' }))
                    .catch((e: any) => {
                        console.error(`Sync failed for uni ${uid}:`, e);
                        return { uniId: uid, status: 'failed', error: e.message };
                    })));
            results.push(...settled);
        }

        return json({ results });
    } catch (err: any) {
        console.error('Universal Sync Error:', err);
        throw error(500, err.message);
    }
};
