import { db, getQuestionsByUnits, getAssessmentUnits } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const {
        university_id, batch_id, branch_id, subject_id,
        exam_type, semester, unit_ids,
        paper_date, exam_time, duration_minutes, max_marks,
        course_code, exam_title, instructions,
        generation_mode, part_a_type
    } = body;

    let template_config = body.template_config;

    if (!subject_id || !unit_ids || unit_ids.length === 0) {
        throw error(400, 'Subject and Units are required');
    }

    try {
        // 1. Fetch available questions
        let allQuestions = await getQuestionsByUnits(unit_ids);

        // BROADEN: If specific units have no questions, try getting all units for this subject
        if (allQuestions.length === 0) {
            const allSubjectUnits = await getAssessmentUnits(subject_id);
            const allSubjectUnitIds = allSubjectUnits.map(u => u.id);
            if (allSubjectUnitIds.length > 0) {
                allQuestions = await getQuestionsByUnits(allSubjectUnitIds);
            }
        }

        if (allQuestions.length === 0) {
            console.warn('[GENERATE] No questions found for units:', unit_ids);
        }

        // Group pool for balanced picking
        const poolByUnitAndMarks: Record<string, Record<number, any[]>> = {};

        // Ensure all unique unit IDs in allQuestions are initialized in the pool
        const allPossibleUnitIds = new Set([...unit_ids, ...allQuestions.map(q => q.unit_id as string)]);
        allPossibleUnitIds.forEach(uid => {
            if (uid) poolByUnitAndMarks[uid] = {};
        });

        allQuestions.forEach(q => {
            const uid = q.unit_id as string;
            const marks = q.marks as number;
            if (!uid || !poolByUnitAndMarks[uid]) return;
            if (!poolByUnitAndMarks[uid][marks]) poolByUnitAndMarks[uid][marks] = [];
            poolByUnitAndMarks[uid][marks].push(q);
        });

        // 2. Prepare Slots to Process
        const slotsToProcess: any[] = [];
        if (generation_mode === 'Modifiable' && template_config) {
            template_config.forEach((section: any) => {
                const partTitle = section.title?.toUpperCase() || '';
                const part = partTitle.includes('PART A') ? 'A' : (partTitle.includes('PART B') ? 'B' : 'C');

                section.slots.forEach((slot: any) => {
                    slotsToProcess.push({
                        ...slot,
                        id: slot.id || uuidv4(),
                        marks: slot.marks || section.marks_per_q,
                        part: part // Explicitly assign part from section
                    });
                });
            });
        } else {
            const is100 = Number(max_marks) === 100;
            const isMCQ = part_a_type === 'MCQ';
            const countA = is100 ? (isMCQ ? 20 : 10) : (isMCQ ? 10 : 5);
            const marksA = isMCQ ? 1 : 2;
            const typeA = isMCQ ? 'MCQ' : 'NORMAL';

            for (let i = 1; i <= countA; i++) {
                slotsToProcess.push({
                    id: uuidv4(),
                    label: `${i}`,
                    marks: marksA,
                    type: 'SINGLE',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: typeA,
                    part: 'A'
                });
            }

            const realCountB = is100 ? 5 : 8;
            for (let i = 0; i < realCountB; i++) {
                const marksB = is100 ? 16 : 5;
                slotsToProcess.push({
                    id: uuidv4(),
                    label: `${countA + 1 + i}`,
                    marks: marksB,
                    type: 'OR_GROUP',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: 'NORMAL',
                    part: 'B',
                    choices: [
                        { label: ``, unit: 'Auto', marks: marksB, hasSubQuestions: false, qType: 'NORMAL', marks_a: Number((marksB / 2).toFixed(1)), marks_b: Number((marksB / 2).toFixed(1)) },
                        { label: ``, unit: 'Auto', marks: marksB, hasSubQuestions: false, qType: 'NORMAL', marks_a: Number((marksB / 2).toFixed(1)), marks_b: Number((marksB / 2).toFixed(1)) }
                    ]
                });
            }

            // For Standard mode, we reconstruct the structure for metadata preservation
            if (!template_config) {
                template_config = [
                    { title: 'PART A', marks_per_q: marksA, count: countA, slots: slotsToProcess.filter(s => s.part === 'A') },
                    { title: 'PART B', marks_per_q: is100 ? 16 : 5, count: realCountB, slots: slotsToProcess.filter(s => s.part === 'B') }
                ];
            }
        }

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const globalUsageCount: Record<string, number> = {};

        // Helper to pick a single question with preference
        function pickOne(marks: number, unitId: string, excludeInSet: Set<string>, qType?: string, bloom?: string, co_id?: string) {
            let pool = (poolByUnitAndMarks[unitId]?.[marks] || [])
                .filter(q => !excludeInSet.has(q.id));

            // Heuristic to detect MCQs or Fill-in-the-blanks hidden in "NORMAL" type
            const isShortOrMcq = (q: any) => {
                const text = (q.question_text || '').toLowerCase();
                const hasBlank = text.includes('___') || text.includes('____') || text.includes('.....');
                const hasOptionsPattern = /\([a-d]\)/i.test(text) || /\b[a-d]\)/i.test(text);
                const hasOptionsField = Array.isArray(q.options) && q.options.length > 0;
                return hasBlank || hasOptionsPattern || hasOptionsField;
            };

            // 1. FILTER BY TYPE (STRICT)
            if (qType && qType !== 'ANY') {
                pool = pool.filter(q => q.type === qType);

                // If we specifically want NORMAL, further exclude heuristic MCQs
                if (qType === 'NORMAL') {
                    pool = pool.filter(q => !isShortOrMcq(q));
                }
            } else if (marks >= 5) {
                // DEFAULT SAFETY: Never pick MCQ or short questions for 5+ marks unless explicitly asked
                pool = pool.filter(q => q.type !== 'MCQ' && !isShortOrMcq(q));
            }

            // 2. FILTER BY BLOOM LEVEL
            if (bloom && bloom !== 'ANY' && pool.length > 0) {
                const bloomFiltered = pool.filter(q => q.bloom_level === bloom);
                if (bloomFiltered.length > 0) pool = bloomFiltered;
            }

            // 3. FILTER BY CO_ID
            if (co_id && pool.length > 0) {
                const coFiltered = pool.filter(q => q.co_id === co_id);
                if (coFiltered.length > 0) pool = coFiltered;
            }

            // Sort by usage count to avoid duplicates across sets if possible
            pool = pool.sort((a, b) => (globalUsageCount[a.id] || 0) - (globalUsageCount[b.id] || 0) || Math.random() - 0.5);

            if (pool.length > 0) {
                const q = pool[0];
                excludeInSet.add(q.id);
                globalUsageCount[q.id] = (globalUsageCount[q.id] || 0) + 1;
                return { id: q.id, text: q.question_text, marks: q.marks, bloom: q.bloom_level, co_id: q.co_id, unit_id: q.unit_id, type: q.type || 'NORMAL', options: q.options };
            }

            // Fallback: Pick different marks from this unit, but STILL respect the type if it's set.
            let fallbackPool = [].concat(...Object.values(poolByUnitAndMarks[unitId] || {}) as any)
                .filter((q: any) => !excludeInSet.has(q.id));

            if (qType && qType !== 'ANY') {
                fallbackPool = fallbackPool.filter((q: any) => q.type === qType);
                if (qType === 'NORMAL') {
                    fallbackPool = fallbackPool.filter(q => !isShortOrMcq(q));
                }
            } else if (marks >= 5) {
                // DEFAULT SAFETY for fallback
                fallbackPool = fallbackPool.filter((q: any) => q.type !== 'MCQ' && !isShortOrMcq(q));
            }

            // Even in fallback, try to respect bloom/co if possible
            if (bloom && bloom !== 'ANY' && fallbackPool.length > 0) {
                const bloomFiltered = fallbackPool.filter((q: any) => q.bloom_level === bloom);
                if (bloomFiltered.length > 0) fallbackPool = bloomFiltered;
            }
            if (co_id && fallbackPool.length > 0) {
                const coFiltered = fallbackPool.filter((q: any) => q.co_id === co_id);
                if (coFiltered.length > 0) fallbackPool = coFiltered;
            }

            fallbackPool = fallbackPool.sort((a: any, b: any) => {
                const diffA = Math.abs(a.marks - marks);
                const diffB = Math.abs(b.marks - marks);
                if (diffA !== diffB) return diffA - diffB;
                return b.marks - a.marks || (globalUsageCount[a.id] || 0) - (globalUsageCount[b.id] || 0);
            });

            if (fallbackPool.length > 0) {
                const q: any = fallbackPool[0];
                excludeInSet.add(q.id);
                globalUsageCount[q.id] = (globalUsageCount[q.id] || 0) + 1;
                return { id: q.id, text: q.question_text, marks: q.marks, bloom: q.bloom_level, co_id: q.co_id, unit_id: q.unit_id, type: q.type || 'NORMAL', options: q.options };
            }

            return null;
        }

        // Helper to pick questions for a choice (can be sub-questions)
        function pickQuestionsForChoice(marks: number, unitId: string, hasSubGroups: boolean, excludeInSet: Set<string>, manualMarks?: number[], qType?: string, bloom?: string, co_id?: string) {
            if (!hasSubGroups) {
                const q = pickOne(marks, unitId, excludeInSet, qType, bloom, co_id);
                return q ? [q] : [];
            } else {
                const splitMarks = manualMarks || [Number((marks / 2).toFixed(1)), Number((marks / 2).toFixed(1))];
                const picked: any[] = [];
                splitMarks.forEach((m, idx) => {
                    const q = pickOne(m, unitId, excludeInSet, qType, bloom, co_id);
                    if (q) picked.push({ ...q, sub_label: `(${String.fromCharCode(idx + 97)})` }); // (a), (b)
                });
                return picked;
            }
        }

        for (const setName of sets) {
            const setQuestions: any[] = [];
            const excludeInSet = new Set<string>();
            let autoUnitCounter = 0;

            for (const slot of slotsToProcess) {
                if (slot.type === 'SINGLE') {
                    // Determine unit
                    let unitId = slot.unit;
                    if (unitId === 'Auto') {
                        unitId = unit_ids[autoUnitCounter % unit_ids.length];
                        autoUnitCounter++;
                    }

                    const manualMarks = slot.hasSubQuestions ? [slot.marks_a, slot.marks_b] : undefined;
                    const questions = pickQuestionsForChoice(slot.marks, unitId, slot.hasSubQuestions, excludeInSet, manualMarks, slot.qType, slot.bloom, slot.co_id);

                    setQuestions.push({
                        type: 'SINGLE',
                        label: slot.label,
                        part: slot.part, // PASS PART TO FINAL OBJECT
                        questions: questions.length > 0 ? questions.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found for Unit ${unitId}]`, marks: slot.marks, part: slot.part }]
                    });
                } else {
                    // OR_GROUP
                    const choiceConfigs = slot.choices || [];
                    const c1 = choiceConfigs[0];
                    const c2 = choiceConfigs[1];

                    let u1 = c1.unit;
                    let u2 = c2.unit;

                    // If both are Auto, they share the same unit to maintain consistency
                    if (u1 === 'Auto' && u2 === 'Auto') {
                        const sharedUnit = unit_ids[autoUnitCounter % unit_ids.length];
                        autoUnitCounter++;
                        u1 = sharedUnit;
                        u2 = sharedUnit;
                    } else {
                        if (u1 === 'Auto') {
                            u1 = unit_ids[autoUnitCounter % unit_ids.length];
                            autoUnitCounter++;
                        }
                        if (u2 === 'Auto') {
                            u2 = unit_ids[autoUnitCounter % unit_ids.length];
                            autoUnitCounter++;
                        }
                    }

                    const m1 = c1.hasSubQuestions ? [c1.marks_a, c1.marks_b] : undefined;
                    const m2 = c2.hasSubQuestions ? [c2.marks_a, c2.marks_b] : undefined;

                    const questions1 = pickQuestionsForChoice(c1.marks, u1, c1.hasSubQuestions, excludeInSet, m1, c1.qType, c1.bloom, c1.co_id);
                    const questions2 = pickQuestionsForChoice(c2.marks, u2, c2.hasSubQuestions, excludeInSet, m2, c2.qType, c2.bloom, c2.co_id);

                    setQuestions.push({
                        type: 'OR_GROUP',
                        label: slot.label,
                        part: slot.part, // PASS PART TO FINAL OBJECT
                        choice1: {
                            label: c1.label,
                            questions: questions1.length > 0 ? questions1.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found for Unit ${u1}]`, marks: c1.marks, part: slot.part }]
                        },
                        choice2: {
                            label: c2.label,
                            questions: questions2.length > 0 ? questions2.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found for Unit ${u2}]`, marks: c2.marks, part: slot.part }]
                        }
                    });
                }
            }

            generatedSets[setName] = { questions: setQuestions };
        }

        // 3. Save to DB
        const { rows } = await db.query(
            `INSERT INTO assessment_papers(
    university_id, batch_id, branch_id, subject_id,
    exam_type, semester, paper_date, duration_minutes,
    max_marks, sets_data
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING * `,
            [
                university_id, batch_id, branch_id, subject_id,
                exam_type, semester, paper_date, duration_minutes,
                max_marks,
                JSON.stringify({
                    ...generatedSets,
                    metadata: {
                        unit_ids, exam_type, semester, paper_date, exam_time,
                        duration_minutes, max_marks, course_code, exam_title, instructions,
                        generation_mode, template_config
                    }
                })
            ]
        );

        return json(rows[0]);
    } catch (err: any) {
        console.error('[GENERATE_API] Error:', err);
        throw error(500, err.message);
    }
};
