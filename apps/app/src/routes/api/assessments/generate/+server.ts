import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import crypto from 'node:crypto';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const body = await request.json();

        const sanitizeUUID = (id: any) => (id === '' || id === undefined || id === 'undefined' ? null : id);

        const {
            subject_id: raw_subject_id,
            university_id: raw_university_id,
            batch_id: raw_batch_id,
            branch_id: raw_branch_id,
            exam_type,
            semester,
            paper_date,
            exam_time,
            duration_minutes,
            course_code,
            exam_title,
            instructions,
            template_id: raw_template_id,
            unit_ids = [],
            topic_ids = [],
            generation_mode = 'Automatic',
            max_marks = 50,
            part_a_type = 'Mixed',
            sets_config = {},
            selected_template = 'standard',
            preview_only = false,
            template_config: incoming_template_config
        } = body;

        const subject_id = sanitizeUUID(raw_subject_id);
        const university_id = sanitizeUUID(raw_university_id);
        const batch_id = sanitizeUUID(raw_batch_id);
        const branch_id = sanitizeUUID(raw_branch_id);
        const template_id = sanitizeUUID(raw_template_id);

        let template_config = incoming_template_config;

        if (!subject_id) throw error(400, 'Subject ID is required');

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

        const normalizeText = (text: string): string => {
            if (!text) return '';
            return text
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .trim();
        };

        const createQuestionHash = (q: any): string => {
            const normalizedText = normalizeText(q.question_text);
            const normalizedOptions = (q.options || [])
                .map((o: string) => normalizeText(o))
                .sort()
                .join('|');
            return crypto.createHash('sha256').update(`${normalizedText}:${normalizedOptions}`).digest('hex');
        };

        // 1. FETCH QUESTION POOL
        let query = `
            SELECT DISTINCT ON (q.id) q.*, t.name as raw_topic_name, u.unit_number 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            LEFT JOIN assessment_topics t ON q.topic_id = t.id
            WHERE u.subject_id = $1
        `;
        const params: any[] = [subject_id];

        if (topic_ids && topic_ids.length > 0) {
            const hasTempId = topic_ids.some((id: string) => id.startsWith('temp-'));
            if (hasTempId) {
                query += ` AND (q.topic_id = ANY($2) OR q.topic_id IS NULL)`;
            } else {
                query += ` AND q.topic_id = ANY($2)`;
            }
            params.push(topic_ids);
        }

        const questionsRes = await db.query(query, params);
        let allQuestions = questionsRes.rows.map((q: any) => ({
            ...q,
            topic_name: getStrictDisplay(q.raw_topic_name)
        }));

        // Initial global shuffle for fair distribution
        for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }

        const allPossibleUnitIdsArr = [...new Set(allQuestions.map(q => q.unit_id))];
        const coRes = await db.query('SELECT id, code FROM assessment_course_outcomes WHERE subject_id = $1', [subject_id]);

        if (allQuestions.length === 0) {
            return json({ error: 'No questions found for this subject.' }, { status: 400 });
        }

        // 2. GLOBAL ARCHITECTURE: REGISTRY & STATE
        const globalUsedIds = new Set<string>();
        const globalUsedTexts = new Set<string>();
        const globalUsedHashes = new Set<string>();

        /**
         * GLOBAL PICK OR SWAP (Mandatory Engine)
         * Enforces absolute uniqueness across all sets.
         */
        const globalPickOrSwap = (params: {
            pool: any[],
            qType: string,
            targetMarks: number,
            unitId: string,
            sectionTitle: string,
            slotId: string,
            setName: string
        }) => {
            const { pool, qType, targetMarks, unitId, sectionTitle, slotId, setName } = params;
            const searchType = qType?.toUpperCase() || 'ANY';

            // Filter by structural requirements
            const candidatePool = pool.filter(q => {
                if (unitId !== 'Auto' && q.unit_id !== unitId) return false;
                if (Number(q.marks) !== Number(targetMarks)) return false;

                if (searchType === 'SHORT') return q.type === 'SHORT' || (Number(q.marks) >= 2 && Number(q.marks) <= 3);
                if (searchType === 'LONG') return !['MCQ', 'FILL_IN_BLANK', 'FIB'].includes(q.type) && Number(q.marks) >= 4;
                if (searchType === 'FILL_IN_BLANK') return q.type === 'FILL_IN_BLANK' || q.type === 'FIB';
                if (searchType === 'MCQ') return q.type === 'MCQ' || (Array.isArray(q.options) && q.options.length > 0) || (Number(q.marks) === 1);
                return true;
            });

            // Fisher-Yates Shuffle for variety within the candidates
            for (let i = candidatePool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]];
            }

            // CRITICAL: Global variety check
            let choice: any = null;
            for (const candidate of candidatePool) {
                const id = candidate.id;
                const text = normalizeText(candidate.question_text);
                const hash = createQuestionHash(candidate);

                const isGlobalDuplicate = globalUsedIds.has(id) || globalUsedTexts.has(text) || globalUsedHashes.has(hash);

                if (!isGlobalDuplicate) {
                    choice = candidate;
                    break;
                }
            }

            if (!choice) {
                throw new Error(`[FAIL LOUDLY] NO UNIQUE QUESTIONS AVAILABLE TO SWAP for Set ${setName}, section "${sectionTitle}" (Slot: ${slotId}). Pool size: ${candidatePool.length}`);
            }

            // Register choice immediately
            globalUsedIds.add(choice.id);
            globalUsedTexts.add(normalizeText(choice.question_text));
            globalUsedHashes.add(createQuestionHash(choice));

            return choice;
        };

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const setDebugInfo: Record<string, any> = {};

        // 3. SEQUENTIAL SET-AWARE GENERATION (A->B->C->D)
        for (const setName of sets) {
            const setQuestions: any[] = [];
            const setAnswerSheet: any[] = [];
            let setUnitIdx = 0;

            if (!template_config || !Array.isArray(template_config)) {
                throw error(400, 'Invalid template configuration');
            }

            template_config.forEach((section: any) => {
                const part = section.part || section.section || (section.title?.toUpperCase()?.includes('PART A') ? 'A' : (section.title?.toUpperCase()?.includes('PART B') ? 'B' : 'C'));

                section.slots.forEach((slot: any) => {
                    const uId = slot.unit === 'Auto' ? (unit_ids[setUnitIdx++ % unit_ids.length] || allPossibleUnitIdsArr[0]) : slot.unit;

                    if (slot.type === 'OR_GROUP') {
                        const q1 = globalPickOrSwap({ pool: allQuestions, qType: slot.qType || 'LONG', targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: `${slot.id}_C1`, setName });
                        const q2 = globalPickOrSwap({ pool: allQuestions, qType: slot.qType || 'LONG', targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: `${slot.id}_C2`, setName });

                        const co1 = coRes.rows.find(c => c.id === q1.co_id)?.code || 'CO1';
                        const co2 = coRes.rows.find(c => c.id === q2.co_id)?.code || 'CO1';

                        const fQ1 = { ...q1, co: co1, target_co: co1, k_level: q1.bloom_level ? `K${q1.bloom_level.replace(/[^0-9]/g, '') || '1'}` : 'K1' };
                        const fQ2 = { ...q2, co: co2, target_co: co2, k_level: q2.bloom_level ? `K${q2.bloom_level.replace(/[^0-9]/g, '') || '1'}` : 'K1' };

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'OR_GROUP', part, marks: slot.marks,
                            choice1: { questions: [fQ1] },
                            choice2: { questions: [fQ2] }
                        });

                        // Answers
                        if (q1.options?.length > 0) setAnswerSheet.push({ questionId: q1.id, correctOption: q1.correct_option, explanation: q1.explanation });
                        if (q2.options?.length > 0) setAnswerSheet.push({ questionId: q2.id, correctOption: q2.correct_option, explanation: q2.explanation });

                    } else {
                        const q = globalPickOrSwap({ pool: allQuestions, qType: slot.qType || 'ANY', targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: slot.id, setName });
                        const coIdx = coRes.rows.find(c => c.id === q.co_id)?.code || 'CO1';
                        const fQ = { ...q, co: coIdx, target_co: coIdx, k_level: q.bloom_level ? `K${q.bloom_level.replace(/[^0-9]/g, '') || '1'}` : 'K1' };

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'SINGLE', part, marks: slot.marks,
                            questions: [fQ]
                        });

                        if (q.options?.length > 0) {
                            setAnswerSheet.push({ questionId: q.id, correctOption: q.correct_option, explanation: q.explanation });
                        }
                    }
                });
            });

            generatedSets[setName] = {
                questions: setQuestions,
                setName,
                answerSheet: { setId: setName, answers: setAnswerSheet }
            };
            setDebugInfo[setName] = {
                questionIds: setQuestions.flatMap(s => s.type === 'OR_GROUP' ? [s.choice1.questions[0].id, s.choice2.questions[0].id] : [s.questions[0].id])
            };

            // Rule 4: Overlap Constraint (<50%)
            for (const prevSet of Object.keys(generatedSets)) {
                if (prevSet === setName) continue;
                const prevIds = new Set(setDebugInfo[prevSet].questionIds);
                const intersection = setDebugInfo[setName].questionIds.filter((id: string) => prevIds.has(id));
                const overlap = (intersection.length / Math.max(prevIds.size, 1)) * 100;
                if (overlap > 50) throw new Error(`Set Variety Violation: ${setName} vs ${prevSet} overlap ${overlap.toFixed(2)}% > 50%`);
            }
        }

        if (preview_only) {
            return json({ sets: generatedSets, template_config, debug: setDebugInfo });
        }

        // 4. PERSISTENCE
        const paperRes = await db.query(
            `INSERT INTO assessment_papers (
                university_id, batch_id, branch_id, subject_id, exam_type, semester, 
                paper_date, duration_minutes, max_marks, template_id, sets_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [
                university_id, batch_id, branch_id, subject_id, exam_type || 'MID1', semester,
                paper_date, duration_minutes, max_marks, template_id,
                JSON.stringify({
                    ...generatedSets,
                    debug: setDebugInfo,
                    metadata: { unit_ids, generation_mode, part_a_type, sets_config, exam_time, course_code, exam_title, instructions, template_config }
                })
            ]
        );

        return json({ id: paperRes.rows[0].id, sets: generatedSets, template_config });

    } catch (err: any) {
        console.error('Generation Error:', err);
        throw error(500, err.message || 'Failed to generate paper');
    }
};
