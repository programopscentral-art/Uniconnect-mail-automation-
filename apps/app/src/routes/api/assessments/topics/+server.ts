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

        const normalizeTopicName = (name: string): string => {
            if (!name) return 'General';
            return name
                .trim()
                .replace(/[-_]/g, ' ')
                .split(/\s+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const unitsWithTopics = await Promise.all(units.map(async (u) => {
            const topics = await getAssessmentTopics(u.id);

            // Fetch questions and their topics for this unit
            const { rows: unitQuestions } = await db.query(
                `SELECT q.*, t.name as topic_name
                 FROM assessment_questions q
                 LEFT JOIN assessment_topics t ON q.topic_id = t.id
                 WHERE q.unit_id = $1`,
                [u.id]
            );

            // Grouping logic
            const topicGroupsMap = new Map<string, any>();

            // Initialize groups from known topics
            topics.forEach(t => {
                const displayName = normalizeTopicName(t.name);
                const key = displayName.toLowerCase();
                if (!topicGroupsMap.has(key)) {
                    topicGroupsMap.set(key, {
                        name: displayName,
                        all_ids: [t.id],
                        id: t.id,
                        question_counts: {},
                        questions: []
                    });
                } else {
                    topicGroupsMap.get(key).all_ids.push(t.id);
                }
            });

            // Aggregate counts and questions
            unitQuestions.forEach(q => {
                const displayName = normalizeTopicName(q.topic_name);
                const key = displayName.toLowerCase();

                let group = topicGroupsMap.get(key);
                if (!group) {
                    group = {
                        name: displayName,
                        all_ids: q.topic_id ? [q.topic_id] : [],
                        id: q.topic_id || `temp-${key}`,
                        question_counts: {},
                        questions: []
                    };
                    topicGroupsMap.set(key, group);
                }

                const marks = q.marks;
                group.question_counts[marks] = (group.question_counts[marks] || 0) + 1;
                group.questions.push({
                    ...q,
                    topic: displayName,
                    topic_name: displayName
                });
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
