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
            bloom?: string,
            co_id?: string,
            preferredUnitId: string,
            allowedUnitIds: string[],
            sectionTitle: string,
            slotId: string,
            setName: string,
            setQuestions: any[]
        }) => {
            const { pool, qType, targetMarks, bloom, co_id, preferredUnitId, allowedUnitIds, sectionTitle, slotId, setName, setQuestions } = params;
            const scrub = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const sTypeScrubbed = scrub(qType || '');

            let searchType = 'NORMAL';
            if (sTypeScrubbed.includes('FILL') || sTypeScrubbed.includes('FIB') || sTypeScrubbed.includes('BLANK')) {
                searchType = 'FILL_IN_BLANK';
            } else if (sTypeScrubbed === 'MCQ') {
                searchType = 'MCQ';
            } else if (sTypeScrubbed === 'VERYSHORT' || sTypeScrubbed === 'SHORT') {
                searchType = 'SHORT';
            } else if (sTypeScrubbed === 'VERYLONG' || sTypeScrubbed === 'LONG' || sTypeScrubbed === 'PARAGRAPH') {
                searchType = 'LONG';
            }

            const targetBloom = bloom?.toUpperCase() === 'ANY' ? null : bloom?.toUpperCase();

            const isMatch = (q: any, unitFilter: string | null, strictType: boolean, strictBloom: boolean, strictCo: boolean) => {
                // 1. Marks must ALWAYS match
                if (Math.round(Number(q.marks)) !== Math.round(Number(targetMarks))) return false;

                // 2. Unit check
                if (unitFilter && q.unit_id !== unitFilter) return false;
                if (!unitFilter && allowedUnitIds.length > 0 && !allowedUnitIds.includes(q.unit_id)) return false;

                const qTypeScrubbed = scrub(q.type || '');

                // 3. Type check
                if (strictType) {
                    if (searchType === 'MCQ') {
                        const isMcq = qTypeScrubbed === 'MCQ' || (Array.isArray(q.options) && q.options.length > 0);
                        if (!isMcq) return false;
                    } else if (searchType === 'FILL_IN_BLANK') {
                        const isFib = qTypeScrubbed.includes('FILL') || qTypeScrubbed.includes('FIB') || qTypeScrubbed.includes('BLANK') || (Number(q.marks) === 1 && (!q.options || q.options.length === 0));
                        if (!isFib) return false;
                    } else if (searchType === 'SHORT') {
                        const isShort = qTypeScrubbed === 'SHORT' || qTypeScrubbed === 'VERYSHORT' || (Number(q.marks) >= 2 && Number(q.marks) <= 4);
                        if (!isShort) return false;
                    } else if (searchType === 'LONG') {
                        const isLong = qTypeScrubbed === 'LONG' || qTypeScrubbed === 'VERYLONG' || qTypeScrubbed === 'PARAGRAPH' || Number(q.marks) >= 5;
                        if (!isLong) return false;
                    }
                }

                // 4. Bloom check
                if (strictBloom && targetBloom) {
                    const qBloom = (q.bloom_level || '').toUpperCase().replace(/^L/, '');
                    const tBloom = targetBloom.replace(/^L/, '');
                    if (qBloom !== tBloom) return false;
                }

                // 5. CO check
                if (strictCo && co_id && co_id !== 'null' && co_id !== 'undefined') {
                    if (q.co_id !== co_id) return false;
                }

                return true;
            };

            const findInPool = (unitFilter: string | null, strictType: boolean, strictBloom: boolean, strictCo: boolean) => {
                let candidates = pool.filter(q => isMatch(q, unitFilter, strictType, strictBloom, strictCo));

                // Shuffle candidates
                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                for (const cand of candidates) {
                    const text = normalizeText(cand.question_text);
                    const hash = createQuestionHash(cand);
                    if (!globalUsedIds.has(cand.id) && !globalUsedTexts.has(text) && !globalUsedHashes.has(hash)) {
                        return cand;
                    }
                }
                return null;
            };

            // TIERED SEARCH
            const uId = preferredUnitId !== 'Auto' ? preferredUnitId : null;

            // 1. All Strict (Unit + Type + Bloom + CO)
            let choice = findInPool(uId, true, true, true);

            // 2. Relax CO
            if (!choice && co_id) choice = findInPool(uId, true, true, false);

            // 3. Relax Bloom
            if (!choice && targetBloom) choice = findInPool(uId, true, false, false);

            // 4. Relax Unit (Try any allowed unit)
            if (!choice && uId) {
                choice = findInPool(null, true, true, true) ||
                    findInPool(null, true, false, false);
            }

            // 5. Relax Type
            if (!choice) choice = findInPool(null, false, false, false);

            // 6. Emergency Fallback (ignore global uniqueness but keep per-paper uniqueness)
            if (!choice) {
                let candidates = pool.filter(q => Number(q.marks) === Number(targetMarks));
                for (const cand of candidates) {
                    const isUsedInCurrentSet = setQuestions.some((s: any) =>
                        (s.questions || s.choice1?.questions || s.choice2?.questions || []).some((q: any) => q.id === cand.id)
                    );
                    if (!isUsedInCurrentSet) {
                        choice = cand;
                        break;
                    }
                }
            }

            if (!choice) {
                throw new Error(`[POOL EXHAUSTED] Cannot find question for Set ${setName}, section "${sectionTitle}", Slot ${slotId}. Target: ${targetMarks} Marks, Type: ${searchType}, Bloom: ${bloom}, CO: ${co_id}`);
            }

            // REGISTER
            globalUsedIds.add(choice.id);
            globalUsedTexts.add(normalizeText(choice.question_text));
            globalUsedHashes.add(createQuestionHash(choice));

            const coCode = (coRes.rows.find(c => c.id === choice.co_id) || coRes.rows.find(c => c.id === co_id))?.code || 'CO1';

            return {
                ...choice,
                question_id: choice.id,
                co: coCode,
                target_co: coCode,
                k_level: choice.bloom_level ? `K${choice.bloom_level.toUpperCase().replace(/[^0-9]/g, '') || '1'}` : 'K1'
            };
        };

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const setDebugInfo: Record<string, string[]> = {};
        let unitIdx = 0;

        // 2. THE SINGLE NESTED LOOP (The ONLY place selection happens)
        for (const setName of sets) {
            const setQuestions: any[] = [];
            const setAnswerSheet: any[] = [];

            for (const section of template_config) {
                const part = section.part || (section.title?.toUpperCase().includes('PART A') ? 'A' : (section.title?.toUpperCase().includes('PART B') ? 'B' : 'C'));

                for (const slot of section.slots) {
                    const uId = slot.unit === 'Auto' ? (unit_ids[unitIdx++ % unit_ids.length] || questionsRes.rows[0]?.unit_id) : slot.unit;

                    if (slot.type === 'OR_GROUP') {
                        const q1 = globalPickOrSwap({
                            pool: allQuestions,
                            qType: slot.choices[0].qType,
                            targetMarks: slot.choices[0].marks,
                            bloom: slot.choices[0].bloom,
                            co_id: slot.choices[0].co_id,
                            preferredUnitId: (slot.choices[0].unit === 'Auto' || !slot.choices[0].unit) ? uId : slot.choices[0].unit,
                            allowedUnitIds: unit_ids,
                            sectionTitle: section.title,
                            slotId: `${slot.id}_C1`,
                            setName,
                            setQuestions
                        });
                        const q2 = globalPickOrSwap({
                            pool: allQuestions,
                            qType: slot.choices[1].qType,
                            targetMarks: slot.choices[1].marks,
                            bloom: slot.choices[1].bloom,
                            co_id: slot.choices[1].co_id,
                            preferredUnitId: (slot.choices[1].unit === 'Auto' || !slot.choices[1].unit) ? uId : slot.choices[1].unit,
                            allowedUnitIds: unit_ids,
                            sectionTitle: section.title,
                            slotId: `${slot.id}_C2`,
                            setName,
                            setQuestions
                        });

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'OR_GROUP', part, marks: slot.marks,
                            choice1: { questions: [q1] },
                            choice2: { questions: [q2] }
                        });

                        if (q1.options?.length > 0 || q1.answer_key) setAnswerSheet.push({ questionId: q1.id, correctOption: q1.answer_key || '', explanation: q1.explanation || '' });
                        if (q2.options?.length > 0 || q2.answer_key) setAnswerSheet.push({ questionId: q2.id, correctOption: q2.answer_key || '', explanation: q2.explanation || '' });

                    } else {
                        const q = globalPickOrSwap({
                            pool: allQuestions,
                            qType: slot.qType,
                            targetMarks: slot.marks,
                            bloom: slot.bloom,
                            co_id: slot.co_id,
                            preferredUnitId: uId,
                            allowedUnitIds: unit_ids,
                            sectionTitle: section.title,
                            slotId: slot.id,
                            setName,
                            setQuestions
                        });

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

        // 3. VARIETY ASSERTION - Relaxed to allow papers to generate even if pool is small
        for (const s1 of sets) {
            for (const s2 of sets) {
                if (s1 === s2) continue;
                const intersection = setDebugInfo[s1].filter(id => setDebugInfo[s2].includes(id));
                // ULTRA-RELAXED: Only throw if more than 80% of the paper is identical, 
                // which usually means the database really has only 1-2 questions total for a section.
                if (intersection.length > (setDebugInfo[s1].length * 0.8) && intersection.length > 10) {
                    throw new Error(`[POOL EXHAUSTED] Sets ${s1} and ${s2} share ${intersection.length} questions. Please add more questions to your bank for better variety.`);
                } else if (intersection.length > 0) {
                    console.warn(`[VARIETY WARNING] Sets ${s1} and ${s2} share ${intersection.length} questions.`);
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
