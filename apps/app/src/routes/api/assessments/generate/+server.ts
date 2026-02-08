import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import crypto from 'node:crypto';

/**
 * ARCHITECTURAL OVERHAAL: ASSESSMENT GENERATION
 * 1. Single source of selection: globalPickOrSwap
 * 2. Sequential Nested Loops: Sets -> Sections -> Slots
 * 3. 100% Global Uniqueness: ID, Text, Hash
 * 4. Mandatory Answer Sheet Generation
 */

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const paperId = url.searchParams.get('paperId');
    const setName = url.searchParams.get('set')?.toUpperCase();
    const format = url.searchParams.get('format') || 'json';

    if (!paperId || !setName) throw error(400, 'Paper ID and Set Name are required');

    const result = await db.query('SELECT sets_data FROM assessment_papers WHERE id = $1', [paperId]);
    if (result.rows.length === 0) throw error(404, 'Paper not found');

    let paperData = result.rows[0].sets_data;
    if (typeof paperData === 'string') {
        try {
            paperData = JSON.parse(paperData);
        } catch (e) {
            throw error(500, 'Failed to parse sets_data');
        }
    }

    const setData = paperData[setName] || paperData[setName.toLowerCase()];
    if (!setData) {
        console.error(`[ANS_KEY] Set ${setName} not found in paper ${paperId}`);
        throw error(404, `Set ${setName} not found in paper`);
    }

    if (!setData.answerSheet) {
        console.warn(`[ANS_KEY] Answer sheet for Set ${setName} missing in paper ${paperId}. Returning empty skeleton.`);
        return format === 'csv'
            ? new Response('QuestionID,CorrectOption,Explanation\n', { headers: { 'Content-Type': 'text/csv' } })
            : json({ setId: setName, answers: [] });
    }

    const { answers } = setData.answerSheet;

    if (format === 'csv') {
        const header = 'QuestionID,CorrectOption,Explanation\n';
        const rows = answers.map((a: any) =>
            `"${a.questionId}","${(a.correctOption || '').replace(/"/g, '""')}","${(a.explanation || '').replace(/"/g, '""')}"`
        ).join('\n');
        return new Response(header + rows, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="answer_sheet_${setName}.csv"`
            }
        });
    }

    return json(setData.answerSheet);
};

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
            max_marks,
            course_code,
            exam_title,
            instructions,
            template_id: raw_template_id,
            unit_ids = [],
            topic_ids = [],
            template_config
        } = body;

        const subject_id = sanitizeUUID(raw_subject_id);
        const university_id = sanitizeUUID(raw_university_id);
        const batch_id = sanitizeUUID(raw_batch_id);
        const branch_id = sanitizeUUID(raw_branch_id);
        const template_id = sanitizeUUID(raw_template_id);

        if (!subject_id) throw error(400, 'Subject ID is required');
        if (!template_config || !Array.isArray(template_config)) throw error(400, 'Invalid template configuration');

        const normalizeText = (text: string): string => {
            if (!text) return '';
            return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        };

        const createQuestionHash = (q: any): string => {
            const normalizedText = normalizeText(q.question_text);
            const normalizedOptions = (q.options || []).map((o: string) => normalizeText(o)).sort().join('|');
            return crypto.createHash('sha256').update(`${normalizedText}:${normalizedOptions}`).digest('hex');
        };

        // 1. Fetch Question Pool
        const questionsRes = await db.query(`
            SELECT DISTINCT ON (q.id) q.*, u.unit_number 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            WHERE u.subject_id = $1
        `, [subject_id]);

        let allQuestions = questionsRes.rows;
        const coRes = await db.query('SELECT id, code FROM assessment_course_outcomes WHERE subject_id = $1', [subject_id]);

        // Global state for entire paper (A, B, C, D)
        const globalUsedIds = new Set<string>();
        const globalUsedTexts = new Set<string>();
        const globalUsedHashes = new Set<string>();

        /**
         * SINGLE SELECTION ENGINE
         * No other function may pick questions.
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

            // Filter context-specific pool
            let candidates = pool.filter(q => {
                if (unitId !== 'Auto' && q.unit_id !== unitId) return false;
                if (Number(q.marks) !== Number(targetMarks)) return false;

                if (searchType === 'SHORT') return q.type === 'SHORT' || (Number(q.marks) >= 2 && Number(q.marks) <= 3);
                if (searchType === 'LONG') return !['MCQ', 'FILL_IN_BLANK', 'FIB'].includes(q.type) && Number(q.marks) >= 4;
                if (searchType === 'FILL_IN_BLANK') return q.type === 'FILL_IN_BLANK' || q.type === 'FIB';
                if (searchType === 'MCQ') return q.type === 'MCQ' || (Array.isArray(q.options) && q.options.length > 0) || (Number(q.marks) === 1);
                return true;
            });

            // Shuffle for variety
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }

            // Strict Global Unique Pick
            let choice = null;
            for (const cand of candidates) {
                const text = normalizeText(cand.question_text);
                const hash = createQuestionHash(cand);
                if (!globalUsedIds.has(cand.id) && !globalUsedTexts.has(text) && !globalUsedHashes.has(hash)) {
                    choice = cand;
                    break;
                }
            }

            if (!choice) {
                throw new Error(`[POOL EXHAUSTED] Cannot find unique question for Set ${setName}, section "${sectionTitle}", Slot ${slotId}. Target: ${targetMarks} Marks, Type: ${searchType}.`);
            }

            // REGISTER IMMEDIATELY
            globalUsedIds.add(choice.id);
            globalUsedTexts.add(normalizeText(choice.question_text));
            globalUsedHashes.add(createQuestionHash(choice));

            const coCode = coRes.rows.find(c => c.id === choice.co_id)?.code || 'CO1';

            return {
                ...choice,
                question_id: choice.id,
                co: coCode,
                target_co: coCode,
                k_level: choice.bloom_level ? `K${choice.bloom_level.replace(/[^0-9]/g, '') || '1'}` : 'K1'
            };
        };

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const setDebugInfo: Record<string, string[]> = {};

        // 2. THE SINGLE NESTED LOOP (The ONLY place selection happens)
        for (const setName of sets) {
            const setQuestions: any[] = [];
            const setAnswerSheet: any[] = [];
            let unitIdx = 0;

            for (const section of template_config) {
                const part = section.part || (section.title?.toUpperCase().includes('PART A') ? 'A' : (section.title?.toUpperCase().includes('PART B') ? 'B' : 'C'));

                for (const slot of section.slots) {
                    const uId = slot.unit === 'Auto' ? (unit_ids[unitIdx++ % unit_ids.length] || questionsRes.rows[0]?.unit_id) : slot.unit;

                    if (slot.type === 'OR_GROUP') {
                        const q1 = globalPickOrSwap({ pool: allQuestions, qType: slot.qType, targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: `${slot.id}_C1`, setName });
                        const q2 = globalPickOrSwap({ pool: allQuestions, qType: slot.qType, targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: `${slot.id}_C2`, setName });

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'OR_GROUP', part, marks: slot.marks,
                            choice1: { questions: [q1] },
                            choice2: { questions: [q2] }
                        });

                        // Store answers for BOTH (Step 6)
                        if (q1.options?.length > 0 || q1.answer_key) setAnswerSheet.push({ questionId: q1.id, correctOption: q1.answer_key || '', explanation: q1.explanation || '' });
                        if (q2.options?.length > 0 || q2.answer_key) setAnswerSheet.push({ questionId: q2.id, correctOption: q2.answer_key || '', explanation: q2.explanation || '' });

                    } else {
                        const q = globalPickOrSwap({ pool: allQuestions, qType: slot.qType, targetMarks: slot.marks, unitId: uId, sectionTitle: section.title, slotId: slot.id, setName });

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'SINGLE', part, marks: slot.marks,
                            questions: [q]
                        });

                        if (q.options?.length > 0 || q.answer_key) {
                            setAnswerSheet.push({ questionId: q.id, correctOption: q.answer_key || '', explanation: q.explanation || '' });
                        }
                    }
                }
            }

            generatedSets[setName] = {
                questions: setQuestions,
                setName,
                answerSheet: { setId: setName, answers: setAnswerSheet }
            };
            setDebugInfo[setName] = setQuestions.flatMap(s => s.type === 'OR_GROUP' ? [s.choice1.questions[0].id, s.choice2.questions[0].id] : [s.questions[0].id]);
        }

        // 3. STRICT OVERLAP ASSERTION (Step 5)
        for (const s1 of sets) {
            for (const s2 of sets) {
                if (s1 === s2) continue;
                const intersection = setDebugInfo[s1].filter(id => setDebugInfo[s2].includes(id));
                if (intersection.length > 0) {
                    throw new Error(`[CRITICAL UNIQUENESS FAILURE] Sets ${s1} and ${s2} share ${intersection.length} questions. Total Variety Rule Violated.`);
                }
            }
        }

        if (body.preview_only) return json({ sets: generatedSets, template_config });

        // 4. PERSPECTIVE
        const paperRes = await db.query(`
            INSERT INTO assessment_papers (
                university_id, batch_id, branch_id, subject_id, exam_type, semester, paper_date, 
                duration_minutes, max_marks, template_id, sets_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
        `, [
            university_id, batch_id, branch_id, subject_id, exam_type || 'MID1', semester, paper_date,
            duration_minutes, max_marks, template_id,
            JSON.stringify({
                ...generatedSets,
                metadata: { exam_time, course_code, exam_title, instructions, template_config }
            })
        ]);

        return json({ id: paperRes.rows[0].id, sets: generatedSets });

    } catch (err: any) {
        console.error('Generation Error:', err);
        throw error(500, err.message || 'Failed to generate paper');
    }
};
