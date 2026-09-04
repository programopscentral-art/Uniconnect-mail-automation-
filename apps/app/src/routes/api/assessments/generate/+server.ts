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
            selected_template,
            unit_ids = [],
            topic_ids = [],
            template_config
        } = body;

        const subject_id = sanitizeUUID(raw_subject_id);
        const university_id = sanitizeUUID(raw_university_id);
        const batch_id = sanitizeUUID(raw_batch_id);
        const branch_id = sanitizeUUID(raw_branch_id);
        const template_id = sanitizeUUID(raw_template_id);

        // Map SGU-specific exam types to the standard DB enum value
        const db_exam_type = (exam_type === 'SGU_SEM_50' || exam_type === 'SGU_SEM_75') ? 'SEM' : exam_type;

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
        let poolQuery = `
            SELECT DISTINCT ON (q.id) q.*, u.unit_number 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            WHERE u.subject_id = $1
        `;
        const poolParams: any[] = [subject_id];

        if (unit_ids && unit_ids.length > 0) {
            poolQuery += ` AND q.unit_id = ANY($2)`;
            poolParams.push(unit_ids);
        }

        const questionsRes = await db.query(poolQuery, poolParams);
        let allQuestions = questionsRes.rows;

        // Apply strict topic filtering when explicit topics were selected.
        //
        // A unit is "restricted" when one of ITS topics was selected — determined
        // from the topics table, NOT by which questions happen to match. The old
        // logic inferred restricted units from matching questions, so selecting a
        // topic (or sub-topic) that had no questions tagged to it left that unit
        // unrestricted and leaked EVERY question in the unit. Selecting a parent
        // topic also pulls in its sub-topics (sessions).
        if (topic_ids && topic_ids.length > 0) {
            const selTopicRows = (await db.query(
                `SELECT id, unit_id FROM assessment_topics
                  WHERE id = ANY($1::uuid[]) OR parent_topic_id = ANY($1::uuid[])`,
                [topic_ids],
            )).rows as Array<{ id: string; unit_id: string }>;

            const allowedTopicIds = new Set<string>(selTopicRows.map(t => t.id));
            for (const id of topic_ids) allowedTopicIds.add(id);
            const restrictedUnits = new Set<string>(selTopicRows.map(t => t.unit_id));

            allQuestions = allQuestions.filter((q: any) => {
                // Units whose topics were selected: keep ONLY selected topics
                // (+ their sub-topics). Units with no selection stay open.
                if (restrictedUnits.has(q.unit_id)) return allowedTopicIds.has(q.topic_id);
                return true;
            });
        }
        const coRes = await db.query('SELECT id, code FROM assessment_course_outcomes WHERE subject_id = $1', [subject_id]);

        // Global state for entire paper (A, B, C, D)
        const globalUsedIds = new Set<string>();
        const globalUsedTexts = new Set<string>();
        const globalUsedHashes = new Set<string>();

        /**
         * Even spread across units.
         *
         * An 'Auto' slot used to take the next unit off a single blind cursor
         * shared by all four sets, and the unit was only a *preference* — tiers 5
         * and 6 drop it — so the counts drifted and a set could lean heavily on
         * one unit. We now count the unit each question ACTUALLY came from and
         * hand the next Auto slot the least-used unit, which self-corrects
         * whenever a relaxation pulls from elsewhere. Reset per set so every set
         * covers the units evenly, not just the paper as a whole.
         */
        let unitUse = new Map<string, number>();
        const noteUnitUse = (unitId?: string | null) => {
            if (!unitId) return;
            unitUse.set(unitId, (unitUse.get(unitId) || 0) + 1);
        };
        const pickBalancedUnit = (allowed: string[]): string | undefined => {
            if (!allowed.length) return undefined;
            let best = allowed[0];
            let bestN = unitUse.get(best) ?? 0;
            for (const u of allowed) {
                const n = unitUse.get(u) ?? 0;
                if (n < bestN) { best = u; bestN = n; }
            }
            return best;
        };

        /**
         * Slots we could not fill from the question bank.
         * Previously an empty pool THREW and aborted the whole paper (users saw
         * generation "get stuck"). We now emit a placeholder for the slot, keep
         * generating, and report every gap back so the user knows exactly which
         * questions to add.
         */
        const unfilled: Array<{
            set: string; section: string; slot: string;
            type: string; marks: number; reason: string;
        }> = [];
        /** Non-fatal problems (e.g. thin bank / low variety) reported to the user. */
        const warnings: string[] = [];

        const makePlaceholder = (
            setName: string, sectionTitle: string, slotId: string,
            searchType: string, targetMarks: number, bloom: any, co_id: any, reason: string
        ) => {
            unfilled.push({ set: setName, section: sectionTitle, slot: slotId, type: searchType, marks: targetMarks, reason });
            return {
                id: `missing-${setName}-${slotId}`,
                question_id: null,
                question_text: `[NO QUESTION AVAILABLE] Add more ${searchType} questions for this subject/unit.`,
                marks: targetMarks,
                type: searchType,
                bloom_level: bloom || null,
                co_id: co_id || null,
                co: 'CO1',
                target_co: 'CO1',
                k_level: 'K1',
                is_placeholder: true,
            };
        };

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
            } else if (sTypeScrubbed.includes('VERYSHORT') || sTypeScrubbed === 'VS') {
                searchType = 'VERY_SHORT';
            } else if (sTypeScrubbed === 'SHORT') {
                searchType = 'SHORT';
            } else if (sTypeScrubbed.includes('VERYLONG') || sTypeScrubbed === 'VL') {
                searchType = 'VERY_LONG';
            } else if (sTypeScrubbed === 'LONG' || sTypeScrubbed === 'PARAGRAPH') {
                searchType = 'LONG';
            }

            const targetBloom = bloom?.toUpperCase() === 'ANY' ? null : bloom?.toUpperCase();

            const isMatch = (q: any, unitFilter: string | null, strictType: boolean, strictBloom: boolean, strictCo: boolean, strictMarks: boolean) => {
                // 1. Marks check (Optional Tier)
                if (strictMarks) {
                    if (Math.round(Number(q.marks)) !== Math.round(Number(targetMarks))) return false;
                }

                // 2. Unit check
                if (unitFilter && q.unit_id !== unitFilter) return false;
                if (!unitFilter && allowedUnitIds.length > 0 && !allowedUnitIds.includes(q.unit_id)) return false;

                const qTypeScrubbed = scrub(q.type || '');

                // 3. Type check
                if (strictType) {
                    const isQMcq = qTypeScrubbed === 'MCQ' || (Array.isArray(q.options) && q.options.length > 0);

                    if (searchType === 'MCQ') {
                        if (!isQMcq) return false;
                    } else if (searchType === 'FILL_IN_BLANK') {
                        const isExplicitlyOther = ['LONG', 'VERYLONG', 'SHORT', 'VERYSHORT', 'PARAGRAPH', 'ESSAY', 'NORMAL'].includes(qTypeScrubbed);
                        const isFib = qTypeScrubbed.includes('FILL') || qTypeScrubbed.includes('FIB') || qTypeScrubbed.includes('BLANK') || (!isExplicitlyOther && !isQMcq && Number(q.marks) === 1);
                        if (!isFib) return false;
                    } else if (searchType === 'VERY_SHORT') {
                        const isExplicitlyOther = ['LONG', 'VERYLONG', 'PARAGRAPH', 'SHORT', 'ESSAY', 'MCQ', 'FILLINBLANK'].includes(qTypeScrubbed);
                        const isVS = qTypeScrubbed === 'VERYSHORT' || qTypeScrubbed === 'VERY_SHORT' || (!isExplicitlyOther && !isQMcq && !qTypeScrubbed.includes('FILL') && Number(q.marks) <= 2);
                        if (!isVS) return false;
                    } else if (searchType === 'SHORT') {
                        const isExplicitlyOther = ['LONG', 'VERYLONG', 'PARAGRAPH', 'VERYSHORT', 'ESSAY', 'MCQ', 'FILLINBLANK'].includes(qTypeScrubbed);
                        const isShort = qTypeScrubbed === 'SHORT' || (!isExplicitlyOther && !isQMcq && !qTypeScrubbed.includes('FILL') && Number(q.marks) >= 2 && Number(q.marks) <= 4);
                        if (!isShort) return false;
                    } else if (searchType === 'VERY_LONG') {
                        const isExplicitlyOther = ['SHORT', 'VERYSHORT', 'MCQ', 'FILLINBLANK'].includes(qTypeScrubbed);
                        const isVL = qTypeScrubbed === 'VERYLONG' || qTypeScrubbed === 'VERY_LONG' || (!isExplicitlyOther && !isQMcq && Number(q.marks) >= 10);
                        if (!isVL) return false;
                    } else if (searchType === 'LONG') {
                        const isExplicitlyOther = ['SHORT', 'VERYSHORT', 'MCQ', 'FILLINBLANK'].includes(qTypeScrubbed);
                        const isLong = qTypeScrubbed === 'LONG' || qTypeScrubbed === 'VERYLONG' || qTypeScrubbed === 'VERY_LONG' || qTypeScrubbed === 'PARAGRAPH' || (!isExplicitlyOther && !isQMcq && Number(q.marks) >= 5);
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

            const findInPool = (unitFilter: string | null, strictType: boolean, strictBloom: boolean, strictCo: boolean, strictMarks: boolean) => {
                let candidates = pool.filter(q => isMatch(q, unitFilter, strictType, strictBloom, strictCo, strictMarks));

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

            // 1. All Strict (Unit + Type + Bloom + CO + MARKS)
            let choice = findInPool(uId, true, true, true, true);

            // 2. Relax CO
            if (!choice && co_id) choice = findInPool(uId, true, true, false, true);

            // 3. Relax Bloom
            if (!choice && targetBloom) choice = findInPool(uId, true, false, false, true);

            // 4. RELAX MARKS (Prioritize Type over Marks)
            if (!choice) choice = findInPool(uId, true, true, true, false) ||
                findInPool(uId, true, false, false, false);

            // 5. Relax Unit (Try any allowed unit)
            if (!choice && uId) {
                choice = findInPool(null, true, true, true, true) ||
                    findInPool(null, true, false, false, false);
            }

            // 6. Emergency Fallback — relax marks/bloom/unit but KEEP type.
            if (!choice) {
                // Try finding any question that matches the searched type (even if marks/bloom/unit differ)
                let candidates = pool.filter(q => isMatch(q, null, true, false, false, false));

                // Question bank has NO questions of this type at all for this subject/unit.
                // Don't abort the paper — emit a placeholder and report the gap.
                if (candidates.length === 0) {
                    return makePlaceholder(
                        setName, sectionTitle, slotId, searchType, targetMarks, bloom, co_id,
                        `No ${searchType} questions exist in the Question Bank for this subject/unit.`
                    );
                }

                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                // 6a. Still insist on paper-wide uniqueness. This tier used to skip
                // the global check entirely, which is how the same question ended up
                // in Set A and Set B whenever the bank was thin.
                choice = candidates.find(c =>
                    !globalUsedIds.has(c.id) &&
                    !globalUsedTexts.has(normalizeText(c.question_text)) &&
                    !globalUsedHashes.has(createQuestionHash(c))
                ) || null;

                // 6b. Last resort: the bank genuinely cannot fill every set without
                // repeating. Reuse across sets rather than leaving a hole, but report
                // it so the user knows to add questions.
                if (!choice) {
                    const reusable = candidates.find(cand => !setQuestions.some((s: any) =>
                        (s.questions || s.choice1?.questions || s.choice2?.questions || []).some((q: any) => q.id === cand.id)
                    ));
                    if (reusable) {
                        choice = reusable;
                        unfilled.push({
                            set: setName, section: sectionTitle, slot: slotId,
                            type: searchType, marks: targetMarks,
                            reason: `Repeated across sets — the bank has too few ${searchType} questions to give every set a unique one. Add more to remove the overlap.`,
                        });
                    }
                }
            }

            // Every candidate is already used elsewhere in this paper. Again: don't
            // abort — placeholder + report, so the rest of the paper still generates.
            if (!choice) {
                return makePlaceholder(
                    setName, sectionTitle, slotId, searchType, targetMarks, bloom, co_id,
                    `Ran out of unused ${searchType} questions (${targetMarks} marks). Add more to the Question Bank.`
                );
            }

            // REGISTER
            globalUsedIds.add(choice.id);
            globalUsedTexts.add(normalizeText(choice.question_text));
            globalUsedHashes.add(createQuestionHash(choice));
            // Count the unit this question really came from (which may differ from
            // the preferred one if a tier relaxed the unit filter).
            noteUnitUse(choice.unit_id);

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

        // 2. THE SINGLE NESTED LOOP (The ONLY place selection happens)
        for (const setName of sets) {
            const setQuestions: any[] = [];
            const setAnswerSheet: any[] = [];
            // Balance units within EACH set, not just across the paper.
            unitUse = new Map<string, number>();

            for (const section of template_config) {
                const part = section.part || (section.title?.toUpperCase().includes('PART A') ? 'A' : (section.title?.toUpperCase().includes('PART B') ? 'B' : 'C'));

                for (const slot of section.slots) {
                    const autoUnits = unit_ids.length
                        ? unit_ids
                        : Array.from(new Set(questionsRes.rows.map((q: any) => q.unit_id).filter(Boolean)));
                    const uId = slot.unit === 'Auto'
                        ? (pickBalancedUnit(autoUnits) || questionsRes.rows[0]?.unit_id)
                        : slot.unit;

                    if (slot.type === 'OR_GROUP') {
                        const questions1 = [];
                        const questions2 = [];

                        // Choice 1
                        if (slot.choices[0].hasSubQuestions) {
                            const subQCount = slot.choices[0].numSubQuestions || 2;
                            const subLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
                            for (let j = 0; j < subQCount; j++) {
                                let targetMarks = slot.choices[0].marks / subQCount;
                                if (subQCount === 2) {
                                    targetMarks = j === 0 ? slot.choices[0].marks_a : slot.choices[0].marks_b;
                                }
                                const sq = globalPickOrSwap({
                                    pool: allQuestions,
                                    qType: slot.choices[0].qType,
                                    targetMarks,
                                    bloom: slot.choices[0].bloom,
                                    co_id: slot.choices[0].co_id,
                                    preferredUnitId: (slot.choices[0].unit === 'Auto' || !slot.choices[0].unit) ? uId : slot.choices[0].unit,
                                    allowedUnitIds: unit_ids,
                                    sectionTitle: section.title,
                                    slotId: `${slot.id}_C1_${subLabels[j]}`,
                                    setName,
                                    setQuestions
                                });
                                sq.sub_label = subLabels[j];
                                questions1.push(sq);
                            }
                        } else {
                            const q = globalPickOrSwap({
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
                            questions1.push(q);
                        }

                        // Choice 2
                        if (slot.choices[1].hasSubQuestions) {
                            const subQCount = slot.choices[1].numSubQuestions || 2;
                            const subLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
                            for (let j = 0; j < subQCount; j++) {
                                let targetMarks = slot.choices[1].marks / subQCount;
                                if (subQCount === 2) {
                                    targetMarks = j === 0 ? slot.choices[1].marks_a : slot.choices[1].marks_b;
                                }
                                const sq = globalPickOrSwap({
                                    pool: allQuestions,
                                    qType: slot.choices[1].qType,
                                    targetMarks,
                                    bloom: slot.choices[1].bloom,
                                    co_id: slot.choices[1].co_id,
                                    preferredUnitId: (slot.choices[1].unit === 'Auto' || !slot.choices[1].unit) ? uId : slot.choices[1].unit,
                                    allowedUnitIds: unit_ids,
                                    sectionTitle: section.title,
                                    slotId: `${slot.id}_C2_${subLabels[j]}`,
                                    setName,
                                    setQuestions
                                });
                                sq.sub_label = subLabels[j];
                                questions2.push(sq);
                            }
                        } else {
                            const q = globalPickOrSwap({
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
                            questions2.push(q);
                        }

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'OR_GROUP', part, marks: slot.marks,
                            choice1: { questions: questions1 },
                            choice2: { questions: questions2 }
                        });

                        questions1.forEach(q => { if (q.options?.length > 0 || q.answer_key) setAnswerSheet.push({ questionId: q.id, correctOption: q.answer_key || '', explanation: q.explanation || '' }); });
                        questions2.forEach(q => { if (q.options?.length > 0 || q.answer_key) setAnswerSheet.push({ questionId: q.id, correctOption: q.answer_key || '', explanation: q.explanation || '' }); });

                    } else {
                        const questions = [];
                        if (slot.hasSubQuestions) {
                            const subQCount = slot.numSubQuestions || 2;
                            const subLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
                            for (let j = 0; j < subQCount; j++) {
                                let targetMarks = slot.marks / subQCount;
                                if (subQCount === 2) {
                                    targetMarks = j === 0 ? slot.marks_a : slot.marks_b;
                                }

                                const sq = globalPickOrSwap({
                                    pool: allQuestions,
                                    qType: slot.qType,
                                    targetMarks,
                                    bloom: slot.bloom,
                                    co_id: slot.co_id,
                                    preferredUnitId: uId,
                                    allowedUnitIds: unit_ids,
                                    sectionTitle: section.title,
                                    slotId: `${slot.id}_${subLabels[j]}`,
                                    setName,
                                    setQuestions
                                });
                                sq.sub_label = subLabels[j];
                                questions.push(sq);
                            }
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
                            questions.push(q);
                        }

                        setQuestions.push({
                            id: slot.id, slot_id: slot.id, type: 'SINGLE', qType: slot.qType, part, marks: slot.marks,
                            questions
                        });

                        questions.forEach(q => {
                            if (q.options?.length > 0 || q.answer_key) {
                                setAnswerSheet.push({ questionId: q.id, correctOption: q.answer_key || '', explanation: q.explanation || '' });
                            }
                        });
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
                    // Previously threw and killed the whole generation when the bank was
                    // thin. Now we still produce the paper and warn loudly instead.
                    warnings.push(
                        `Sets ${s1} and ${s2} share ${intersection.length} questions — the Question Bank is too small for good variety. Add more questions.`
                    );
                } else if (intersection.length > 0) {
                    console.warn(`[VARIETY WARNING] Sets ${s1} and ${s2} share ${intersection.length} questions.`);
                }
            }
        }

        if (body.preview_only) return json({ sets: generatedSets, template_config, unfilled, warnings });

        // 4. PERSPECTIVE
        const paperRes = await db.query(`
            INSERT INTO assessment_papers (
                university_id, batch_id, branch_id, subject_id, exam_type, semester, paper_date, 
                duration_minutes, max_marks, template_id, sets_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
        `, [
            university_id, batch_id, branch_id, subject_id, db_exam_type || 'MID1', semester, paper_date,
            duration_minutes, max_marks, template_id,
            JSON.stringify({
                ...generatedSets,
                metadata: { exam_time, course_code, exam_title, instructions, template_config, selected_template }
            })
        ]);

        return json({ id: paperRes.rows[0].id, sets: generatedSets, unfilled, warnings });

    } catch (err: any) {
        console.error('Generation Error:', err);
        throw error(500, err.message || 'Failed to generate paper');
    }
};
