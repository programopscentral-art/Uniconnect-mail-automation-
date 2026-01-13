import { db, getQuestionsByUnits, getAssessmentUnits } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const {
        university_id, batch_id, branch_id, subject_id,
        exam_type, semester, unit_ids,
        paper_date, exam_time, duration_minutes, max_marks,
        course_code, exam_title, instructions,
        generation_mode, template_config, part_a_type
    } = body;

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
        unit_ids.forEach((uid: string) => { poolByUnitAndMarks[uid] = {}; });

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
                section.slots.forEach((slot: any) => {
                    slotsToProcess.push({
                        ...slot,
                        marks: slot.marks || section.marks_per_q // Fallback to section marks if not set
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
                    label: `${i}`,
                    marks: marksA,
                    type: 'SINGLE',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: typeA
                });
            }

            const countB = is100 ? 5 : 8; // Adjusting 100m to 5 questions in Part B if needed, 
            // but let's stick to original logic unless asked. 
            // Wait, the user said for 100m it should be 10 Qs in Part A and 5 in Part B (OR).
            // Original code had 4 + 1 = 5 for 100m.

            const realCountB = is100 ? 5 : 8;
            for (let i = 0; i < realCountB; i++) {
                slotsToProcess.push({
                    label: `${countA + 1 + i}`,
                    marks: is100 ? 16 : 5,
                    type: 'OR_GROUP',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: 'NORMAL'
                });
            }
        }

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const globalUsageCount: Record<string, number> = {};

        // Helper to pick a single question with preference
        function pickOne(marks: number, unitId: string, excludeInSet: Set<string>, qType?: string) {
            let pool = (poolByUnitAndMarks[unitId]?.[marks] || [])
                .filter(q => !excludeInSet.has(q.id));

            // STRICT filtering: If a type is specified (MCQ or NORMAL), we MUST respect it if possible.
            // We should only fall back to 'ANY' if the user explicitly set qType to 'ANY'.
            if (qType && qType !== 'ANY') {
                const typeFiltered = pool.filter(q => q.type === qType);
                if (typeFiltered.length > 0) pool = typeFiltered;
                else if (qType === 'NORMAL') {
                    // If looking for a 5/16 mark NORMAL question and none found, 
                    // DON'T pick an MCQ. An MCQ in a 5/16 mark slot is obviously wrong.
                    pool = [];
                }
            }

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
                const typeFiltered = fallbackPool.filter((q: any) => q.type === qType);
                if (typeFiltered.length > 0) fallbackPool = typeFiltered;
                else if (qType === 'NORMAL') fallbackPool = [];
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
        function pickQuestionsForChoice(marks: number, unitId: string, hasSubGroups: boolean, excludeInSet: Set<string>, manualMarks?: number[], qType?: string) {
            if (!hasSubGroups) {
                const q = pickOne(marks, unitId, excludeInSet, qType);
                return q ? [q] : [];
            } else {
                const splitMarks = manualMarks || [Number((marks / 2).toFixed(1)), Number((marks / 2).toFixed(1))];
                const picked: any[] = [];
                splitMarks.forEach((m, idx) => {
                    const q = pickOne(m, unitId, excludeInSet, qType);
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
                    const questions = pickQuestionsForChoice(slot.marks, unitId, slot.hasSubQuestions, excludeInSet, manualMarks, slot.qType);

                    setQuestions.push({
                        type: 'SINGLE',
                        label: slot.label,
                        questions: questions.length > 0 ? questions : [{ text: `[No question found for Unit ${unitId}]`, marks: slot.marks }]
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

                    const questions1 = pickQuestionsForChoice(c1.marks, u1, c1.hasSubQuestions, excludeInSet, m1, c1.qType);
                    const questions2 = pickQuestionsForChoice(c2.marks, u2, c2.hasSubQuestions, excludeInSet, m2, c2.qType);

                    setQuestions.push({
                        type: 'OR_GROUP',
                        label: slot.label,
                        choice1: {
                            label: c1.label,
                            questions: questions1.length > 0 ? questions1 : [{ text: `[No question found for Unit ${u1}]`, marks: c1.marks }]
                        },
                        choice2: {
                            label: c2.label,
                            questions: questions2.length > 0 ? questions2 : [{ text: `[No question found for Unit ${u2}]`, marks: c2.marks }]
                        }
                    });
                }
            }

            generatedSets[setName] = { questions: setQuestions };
        }

        // 3. Save to DB
        const { rows } = await db.query(
            `INSERT INTO assessment_papers (
                university_id, batch_id, branch_id, subject_id, 
                exam_type, semester, paper_date, duration_minutes, 
                max_marks, sets_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
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
