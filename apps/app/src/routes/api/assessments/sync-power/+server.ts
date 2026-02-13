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

        // 3. Sync to each university sequentially for stability
        const results = [];
        for (const uniId of targetUniversityIds) {
            try {
                // a. Find or create target batch
                let { rows: [targetBatch] } = await db.query(
                    'SELECT id FROM assessment_batches WHERE university_id = $1 AND name = $2',
                    [uniId, targetBatchName]
                );

                if (!targetBatch) {
                    const { rows: [newBatch] } = await db.query(
                        'INSERT INTO assessment_batches (university_id, name) VALUES ($1, $2) RETURNING id',
                        [uniId, targetBatchName]
                    );
                    targetBatch = newBatch;
                }

                // b. Find or create target branch (department)
                let { rows: [targetBranch] } = await db.query(
                    'SELECT id FROM assessment_branches WHERE university_id = $1 AND name = $2 AND batch_id = $3',
                    [uniId, sourceSubject.branch_name, targetBatch.id]
                );

                if (!targetBranch) {
                    const { rows: [newBranch] } = await db.query(
                        'INSERT INTO assessment_branches (university_id, name, batch_id) VALUES ($1, $2, $3) RETURNING id',
                        [uniId, sourceSubject.branch_name, targetBatch.id]
                    );
                    targetBranch = newBranch;
                }

                // c. Find or create target subject
                let { rows: [targetSubject] } = await db.query(
                    'SELECT id FROM assessment_subjects WHERE branch_id = $1 AND name = $2 AND batch_id = $3',
                    [targetBranch.id, sourceSubject.name, targetBatch.id]
                );

                if (!targetSubject) {
                    const { rows: [newSub] } = await db.query(
                        'INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester, difficulty_levels) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                        [targetBranch.id, targetBatch.id, sourceSubject.name, sourceSubject.code, sourceSubject.semester, sourceSubject.difficulty_levels]
                    );
                    targetSubject = newSub;
                } else {
                    // Clear existing data - CASCADE handles topics and questions
                    await db.query('DELETE FROM assessment_units WHERE subject_id = $1', [targetSubject.id]);
                    await db.query('DELETE FROM assessment_practicals WHERE subject_id = $1', [targetSubject.id]);
                    await db.query('DELETE FROM assessment_course_outcomes WHERE subject_id = $1', [targetSubject.id]);
                }

                // d. Copy Portion
                const unitMap = new Map();
                for (const unit of units) {
                    const { rows: [newUnit] } = await db.query(
                        'INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING id',
                        [targetSubject.id, unit.unit_number, unit.name]
                    );
                    unitMap.set(unit.id, newUnit.id);
                }

                const topicMap = new Map();
                const rootTopics = topics.filter(t => !t.parent_topic_id);
                for (const topic of rootTopics) {
                    const newUnitId = unitMap.get(topic.unit_id);
                    if (!newUnitId) continue;
                    const { rows: [newTopic] } = await db.query(
                        'INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING id',
                        [newUnitId, topic.name]
                    );
                    topicMap.set(topic.id, newTopic.id);
                }

                const subTopics = topics.filter(t => t.parent_topic_id);
                for (const topic of subTopics) {
                    const newUnitId = unitMap.get(topic.unit_id);
                    const newParentId = topicMap.get(topic.parent_topic_id);
                    if (!newUnitId || !newParentId) continue;
                    await db.query(
                        'INSERT INTO assessment_topics (unit_id, name, parent_topic_id) VALUES ($1, $2, $3)',
                        [newUnitId, topic.name, newParentId]
                    );
                }

                for (const p of practicals) {
                    await db.query(
                        'INSERT INTO assessment_practicals (subject_id, name, description) VALUES ($1, $2, $3)',
                        [targetSubject.id, p.name, p.description]
                    );
                }

                const coMap = new Map();
                for (const co of cos) {
                    const { rows: [newCo] } = await db.query(
                        'INSERT INTO assessment_course_outcomes (subject_id, code, description) VALUES ($1, $2, $3) RETURNING id',
                        [targetSubject.id, co.code, co.description]
                    );
                    coMap.set(co.id, newCo.id);
                }

                if (syncQuestionBank && questions.length > 0) {
                    const values: any[] = [];
                    const valuePlaceholders: string[] = [];
                    let pIdx = 1;

                    for (const q of questions) {
                        const tId = q.topic_id ? topicMap.get(q.topic_id) : null;
                        const uId = q.unit_id ? unitMap.get(q.unit_id) : null;
                        const cId = q.co_id ? coMap.get(q.co_id) : null;

                        valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                        values.push(
                            tId, uId, cId, q.question_text, q.bloom_level, q.difficulty || 'MEDIUM', q.marks, q.type,
                            typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
                            q.answer_key, q.image_url, q.explanation, q.is_important || false
                        );
                    }

                    const bulkQuery = `
                        INSERT INTO assessment_questions (
                            topic_id, unit_id, co_id, question_text, bloom_level, difficulty, marks, type, options, 
                            answer_key, image_url, explanation, is_important
                        ) VALUES ${valuePlaceholders.join(', ')}
                    `;
                    await db.query(bulkQuery, values);
                }

                results.push({ uniId, status: 'success' });
            } catch (innerErr: any) {
                console.error(`Sync failed for uni ${uniId}:`, innerErr);
                results.push({ uniId, status: 'failed', error: innerErr.message });
            }
        }

        return json({ results });
    } catch (err: any) {
        console.error('Universal Sync Error:', err);
        throw error(500, err.message);
    }
};
