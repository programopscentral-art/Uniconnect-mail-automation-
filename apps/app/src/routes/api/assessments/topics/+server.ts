import { db, getAssessmentUnits, getAssessmentTopics, createAssessmentTopic, deleteAssessmentTopic } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'Subject ID is required');

    try {
        const units = await getAssessmentUnits(subjectId);

        const getStrictDisplay = (name: string): string => {
            if (!name) return 'General';
            return name
                .replace(/&/g, 'And')
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .trim()
                .split(/\s+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const getExtremeCanonical = (name: string): string => {
            if (!name) return 'general';
            return name
                .toLowerCase()
                .replace(/&/g, 'and')
                .replace(/[^a-z0-9]/g, '')
                .replace(/s$/, '')
                .trim() || 'general';
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

            /*
             * Portion hierarchy: Module (unit) -> Topic -> Session.
             * Sessions are assessment_topics rows with parent_topic_id set. They
             * used to be flattened in beside their own parent, so a module showed
             * one long mixed list and a paper-setter could not see which sessions
             * sat under which topic. Group by parent topic and nest the sessions,
             * keeping every id in all_ids so selecting a topic still selects
             * everything beneath it.
             */
            const topicById = new Map<string, any>(topics.map((t: any) => [t.id, t]));
            const parents = topics.filter((t: any) => !t.parent_topic_id);
            const children = topics.filter((t: any) => t.parent_topic_id);

            const topicGroupsMap = new Map<string, any>();
            const groupOfTopicId = new Map<string, any>();

            const groupFor = (t: any) => {
                const key = getExtremeCanonical(t.name);
                let g = topicGroupsMap.get(key);
                if (!g) {
                    g = { name: getStrictDisplay(t.name), id: t.id, all_ids: [], own_ids: [], sessions: [], question_counts: {}, questions: [] };
                    topicGroupsMap.set(key, g);
                }
                if (!g.all_ids.includes(t.id)) g.all_ids.push(t.id);
                if (!g.own_ids.includes(t.id)) g.own_ids.push(t.id);
                groupOfTopicId.set(t.id, g);
                return g;
            };

            // 1. Top-level topics become the groups.
            parents.forEach(groupFor);

            // 2. Sessions nest under their parent's group (or promote to a group
            //    of their own if the parent row is missing).
            const sessionMap = new Map<string, any>(); // sessionKey -> session entry
            children.forEach((c: any) => {
                const parent = topicById.get(c.parent_topic_id);
                const g = parent ? (groupOfTopicId.get(parent.id) || groupFor(parent)) : groupFor(c);
                if (!parent) return; // promoted: it IS the group
                const sk = g.name + '||' + getExtremeCanonical(c.name);
                let sess = sessionMap.get(sk);
                if (!sess) {
                    sess = { id: c.id, name: getStrictDisplay(c.name), all_ids: [], question_counts: {} };
                    sessionMap.set(sk, sess);
                    g.sessions.push(sess);
                }
                if (!sess.all_ids.includes(c.id)) sess.all_ids.push(c.id);
                if (!g.all_ids.includes(c.id)) g.all_ids.push(c.id);
                groupOfTopicId.set(c.id, g);
                // remember which session a question on this id belongs to
                sess.__ids = sess.all_ids;
            });
            const sessionOfTopicId = new Map<string, any>();
            for (const g of topicGroupsMap.values()) {
                for (const sess of g.sessions) for (const id of sess.all_ids) sessionOfTopicId.set(id, sess);
            }

            // 3. Aggregate question counts onto the group and, when the question
            //    hangs off a session, onto that session too.
            unitQuestions.forEach(q => {
                let group = q.topic_id ? groupOfTopicId.get(q.topic_id) : undefined;
                if (!group) {
                    const key = getExtremeCanonical(q.topic_name);
                    group = topicGroupsMap.get(key);
                    if (!group) {
                        group = {
                            name: getStrictDisplay(q.topic_name),
                            id: q.topic_id || `temp-${key}`,
                            all_ids: q.topic_id ? [q.topic_id] : [],
                            own_ids: q.topic_id ? [q.topic_id] : [],
                            sessions: [], question_counts: {}, questions: []
                        };
                        topicGroupsMap.set(key, group);
                    }
                    if (q.topic_id) groupOfTopicId.set(q.topic_id, group);
                }
                const marks = q.marks;
                group.question_counts[marks] = (group.question_counts[marks] || 0) + 1;
                group.questions.push({ ...q, topic: group.name, topic_name: group.name });

                const sess = q.topic_id ? sessionOfTopicId.get(q.topic_id) : undefined;
                if (sess) sess.question_counts[marks] = (sess.question_counts[marks] || 0) + 1;
            });

            const topicGroups = Array.from(topicGroupsMap.values())
                .map((g: any) => { g.sessions.sort((a: any, b: any) => a.name.localeCompare(b.name)); return g; })
                .sort((a, b) => a.name.localeCompare(b.name));

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
