import { db, createAssessmentTopic, getAssessmentTopics, deleteAssessmentTopic } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    try {
        const { rows: units } = await db.query(
            `SELECT * FROM assessment_units WHERE subject_id = $1 ORDER BY unit_number ASC`,
            [subjectId]
        );

        const unitsWithTopics = await Promise.all(units.map(async (u) => {
            const topics = await getAssessmentTopics(u.id);

            // Fetch counts for all questions in this unit to group by topic name
            const { rows: unitQuestions } = await db.query(
                `SELECT q.marks, q.topic_id, t.name as topic_name
                 FROM assessment_questions q
                 LEFT JOIN assessment_topics t ON q.topic_id = t.id
                 WHERE q.unit_id = $1`,
                [u.id]
            );

            // Grouping logic
            const topicGroupsMap = new Map<string, any>();

            // Initialize groups from known topics to ensure even zero-count topics appear
            topics.forEach(t => {
                const normName = (t.name || 'General').trim();
                const key = normName.toLowerCase();
                if (!topicGroupsMap.has(key)) {
                    topicGroupsMap.set(key, {
                        name: normName,
                        all_ids: [t.id],
                        id: t.id, // Representative ID
                        question_counts: {}
                    });
                } else {
                    topicGroupsMap.get(key).all_ids.push(t.id);
                }
            });

            // Aggregate counts from questions
            unitQuestions.forEach(q => {
                const normName = (q.topic_name || 'General').trim();
                const key = normName.toLowerCase();

                let group = topicGroupsMap.get(key);
                if (!group) {
                    // Handle cases where question refers to a topic name not in explicit topics table
                    group = {
                        name: normName,
                        all_ids: q.topic_id ? [q.topic_id] : [],
                        id: q.topic_id || `temp-${key}`,
                        question_counts: {}
                    };
                    topicGroupsMap.set(key, group);
                }

                const marks = q.marks;
                group.question_counts[marks] = (group.question_counts[marks] || 0) + 1;
            });

            const topicGroups = Array.from(topicGroupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

            const { rows: unitCounts } = await db.query(
                'SELECT marks, COUNT(*) as count FROM assessment_questions WHERE unit_id = $1 GROUP BY marks',
                [u.id]
            );
            return {
                ...u,
                topics: topicGroups,
                question_counts: unitCounts.reduce((acc: any, curr: any) => {
                    acc[curr.marks] = parseInt(curr.count);
                    return acc;
                }, {}),
                bloom_counts: (await db.query(
                    'SELECT bloom_level, COUNT(*) as count FROM assessment_questions WHERE unit_id = $1 GROUP BY bloom_level',
                    [u.id]
                )).rows.reduce((acc: any, curr: any) => {
                    acc[curr.bloom_level] = parseInt(curr.count);
                    return acc;
                }, {})
            };
        }));

        return json(unitsWithTopics);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.unit_id || !body.name) {
        throw error(400, 'Unit ID and Topic Name are required');
    }

    try {
        const topic = await createAssessmentTopic(body);
        return json(topic);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'ID is required');

    try {
        await deleteAssessmentTopic(id);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
