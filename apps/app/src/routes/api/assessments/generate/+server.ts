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

    const sets_config = body.sets_config || {}; // Per-set difficulty profiles

    try {
        // ... (rest of the fetching logic)
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
        } else {
            // Robust Fisher-Yates Shuffle
            for (let i = allQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
            }
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

        const allPossibleUnitIdsArr = Array.from(allPossibleUnitIds);

        // 2. Prepare Slots to Process
        const slotsToProcess: any[] = [];
        if (generation_mode === 'Modifiable' && template_config) {
            template_config.forEach((section: any) => {
                // Use stable 'part' property from section if available, otherwise fallback to title parsing
                const part = section.part || (section.title?.toUpperCase()?.includes('PART A') ? 'A' : (section.title?.toUpperCase()?.includes('PART B') ? 'B' : 'C'));

                section.slots.forEach((slot: any) => {
                    slotsToProcess.push({
                        ...slot,
                        id: slot.id || uuidv4(),
                        marks: slot.marks || section.marks_per_q,
                        part: part
                    });
                });
            });
        } else {
            const is100 = Number(max_marks) === 100;
            const isMCQ = part_a_type === 'MCQ';
            const isMixed = part_a_type === 'Mixed';
            const countA = is100 ? (isMCQ ? 20 : 10) : (isMCQ ? 10 : 5);
            const marksA = isMCQ ? 1 : 2;
            const typeA = isMixed ? 'MIXED' : (isMCQ ? 'MCQ' : 'NORMAL');

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
        function pickOne(targetMarks: number, unitId: string, excludeInSet: Set<string>, qType?: string, bloomArr?: string[], co_id?: string) {
            const isShortOrMcq = (q: any) => {
                const text = (q.question_text || '').toLowerCase();
                const hasBlank = text.includes('___') || text.includes('____') || text.includes('.....');
                const hasOptionsPattern = /\([a-d]\)/i.test(text) || /\b[a-d]\)/i.test(text);
                const hasOptionsField = Array.isArray(q.options) && q.options.length > 0;
                return hasBlank || hasOptionsPattern || hasOptionsField;
            };

            const filterPool = (pool: any[], strictMarks: boolean = false) => {
                let filtered = pool.filter(q => !excludeInSet.has(q.id));
                if (strictMarks) {
                    filtered = filtered.filter(q => Number(q.marks) === Number(targetMarks));
                }

                if (qType && qType !== 'ANY') {
                    if (qType === 'MIXED') {
                        filtered = filtered.filter(q => ['MCQ', 'FILL_IN_BLANK', 'VERY_SHORT', 'SHORT', 'LONG', 'VERY_LONG', 'PARAGRAPH'].includes(q.type || '') || isShortOrMcq(q));
                    } else if (qType === 'NORMAL') {
                        // NORMAL slots should allow anything NOT explicitly MCQ/FIB if marks are low.
                        // For 5+ marks, we allow them because some subjects (like Aptitude) use them for high-mark slots.
                        if (targetMarks < 5) {
                            filtered = filtered.filter(q => !['MCQ', 'FILL_IN_BLANK'].includes(q.type || ''));
                            filtered = filtered.filter(q => !isShortOrMcq(q));
                        }
                    } else {
                        // Strict type matching for specific types like MCQ, FIB, PARAGRAPH
                        filtered = filtered.filter(q => q.type === qType);
                    }
                } else if (targetMarks >= 5) {
                    // Part B/C 
                } else if (targetMarks < 5 && (!qType || qType === 'NORMAL')) {
                    // PART A fallback protection: if marks are small, prefer NORMAL/MCQ mixed if pool is dry
                    const tight = filtered.filter(q => !['MCQ', 'FILL_IN_BLANK'].includes(q.type || '') && !isShortOrMcq(q));
                    if (tight.length > 0) filtered = tight;
                }

                if (bloomArr && bloomArr.length > 0 && !bloomArr.includes('ANY') && filtered.length > 0) {
                    const bFiltered = filtered.filter(q => bloomArr.includes(q.bloom_level));
                    if (bFiltered.length > 0) filtered = bFiltered;
                    // FALLBACK: If bloom filter kills all results, revert to filtered pool
                }
                if (co_id && filtered.length > 0) {
                    const cFiltered = filtered.filter(q => q.co_id === co_id);
                    if (cFiltered.length > 0) filtered = cFiltered;
                }

                // FINAL SAFETY: If qType filter killed all results, fallback to everything
                if (filtered.length === 0 && pool.length > 0) {
                    return pool.filter(q => !excludeInSet.has(q.id));
                }

                return filtered;
            };

            const finalize = (pool: any[]) => {
                // 1. Internal shuffle to randomize candidates with equal priority
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }

                // 2. Sort by preference with STRONG randomization
                const sorted = pool.sort((a, b) => {
                    const diffA = Math.abs(a.marks - targetMarks);
                    const diffB = Math.abs(b.marks - targetMarks);
                    if (diffA !== diffB) return diffA - diffB;

                    const usageA = globalUsageCount[a.id] || 0;
                    const usageB = globalUsageCount[b.id] || 0;
                    if (usageA !== usageB) return usageA - usageB;

                    // STRONG random tie-breaker
                    return Math.random() - 0.5;
                });

                const q = sorted[0];
                excludeInSet.add(q.id);
                globalUsageCount[q.id] = (globalUsageCount[q.id] || 0) + 1;
                return {
                    id: q.id, text: q.question_text, marks: q.marks, bloom: q.bloom_level,
                    co_id: q.co_id, unit_id: q.unit_id, type: q.type || 'NORMAL',
                    options: q.options, image_url: q.image_url
                };
            };

            // 1. BEST CASE: Unit + Specific Marks
            let pool = filterPool(poolByUnitAndMarks[unitId]?.[targetMarks] || [], true);
            if (pool.length > 0) return finalize(pool);

            // 2. FUZZY CASE 1: Same Unit, Close Marks
            const allUnitQuestions = [].concat(...Object.values(poolByUnitAndMarks[unitId] || {}) as any);
            pool = filterPool(allUnitQuestions, false);
            if (pool.length > 0) return finalize(pool);

            // 3. FALLBACK CASE: Anywhere in Subject, Preferred Marks
            const allSubjectQuestions = allQuestions;
            pool = filterPool(allSubjectQuestions, true);
            if (pool.length > 0) return finalize(pool);

            // 4. DESPERATE CASE: Same Unit, Any Marks (even if mismatch)
            pool = filterPool(allUnitQuestions, false);
            if (pool.length > 0) return finalize(pool);

            // 5. ULTIMATE FALLBACK: Anywhere in Subject, Any Marks
            pool = filterPool(allSubjectQuestions, false);
            if (pool.length > 0) return finalize(pool);

            return null;
        }

        // Helper to pick questions for a choice (can be sub-questions)
        function pickQuestionsForChoice(marks: number, unitId: string, hasSubGroups: boolean, excludeInSet: Set<string>, manualMarks?: number[], qType?: string, bloomArr?: string[], co_id?: string) {
            if (!hasSubGroups) {
                const q = pickOne(marks, unitId, excludeInSet, qType, bloomArr, co_id);
                return q ? [q] : [];
            } else {
                const splitMarks = manualMarks || [Number((marks / 2).toFixed(1)), Number((marks / 2).toFixed(1))];
                const picked: any[] = [];
                splitMarks.forEach((m, idx) => {
                    const q = pickOne(m, unitId, excludeInSet, qType, bloomArr, co_id);
                    if (q) picked.push({ ...q, sub_label: `(${String.fromCharCode(idx + 97)})` }); // (a), (b)
                });
                return picked;
            }
        }

        const globalExcluded = new Set<string>();

        for (const setName of sets) {
            const setQuestions: any[] = [];

            // CRITICAL FIX: Every set must have its OWN shuffled pool to ensure randomization
            const currentPool = [...allQuestions].sort(() => Math.random() - 0.5);
            const currentPoolByUnitAndMarks: Record<string, Record<number, any[]>> = {};
            allPossibleUnitIdsArr.forEach(uid => { if (uid) currentPoolByUnitAndMarks[uid] = {}; });

            currentPool.forEach((q: any) => {
                const uid = q.unit_id as string;
                const marks = q.marks as number;
                if (!uid || !currentPoolByUnitAndMarks[uid]) return;
                if (!currentPoolByUnitAndMarks[uid][marks]) currentPoolByUnitAndMarks[uid][marks] = [];
                (currentPoolByUnitAndMarks[uid][marks] as any[]).push(q);
            });

            const excludeInSet = new Set<string>([...globalExcluded]);
            let autoUnitCounter = 0;
            const setDifficulty = sets_config[setName] || ['ANY'];

            // Local picking function that uses the SET-SPECIFIC currentPoolByUnitAndMarks
            const localPickOne = (targetMarks: number, unitId: string, exclude: Set<string>, qType?: string, bloomArr?: string[], co_id?: string) => {
                const isShortOrMcq = (q: any) => {
                    const text = (q.question_text || '').toLowerCase();
                    return text.includes('___') || text.includes('....') || (Array.isArray(q.options) && q.options.length > 0);
                };

                const filterPool = (pool: any[], strictMarks: boolean = false) => {
                    let filtered = pool.filter(q => !exclude.has(q.id));
                    if (strictMarks) filtered = filtered.filter(q => Number(q.marks) === Number(targetMarks));
                    if (qType && qType !== 'ANY') {
                        if (qType === 'MIXED') filtered = filtered.filter(q => ['MCQ', 'FILL_IN_BLANK', 'VERY_SHORT', 'SHORT', 'LONG', 'VERY_LONG', 'PARAGRAPH'].includes(q.type || '') || isShortOrMcq(q));
                        else if (qType === 'NORMAL' && targetMarks < 5) filtered = filtered.filter(q => !['MCQ', 'FILL_IN_BLANK'].includes(q.type || '') && !isShortOrMcq(q));
                        else filtered = filtered.filter(q => q.type === qType);
                    }
                    if (bloomArr && bloomArr.length > 0 && !bloomArr.includes('ANY') && filtered.length > 0) {
                        const bFiltered = filtered.filter(q => bloomArr.includes(q.bloom_level));
                        if (bFiltered.length > 0) filtered = bFiltered;
                    }
                    if (co_id && filtered.length > 0) {
                        const cFiltered = filtered.filter(q => q.co_id === co_id);
                        if (cFiltered.length > 0) filtered = cFiltered;
                    }
                    return filtered;
                };

                const finalize = (p: any[]) => {
                    // Pool is already shuffled in currentPool, but we shuffle candidates for extra randomness
                    const choice = p[Math.floor(Math.random() * p.length)];
                    exclude.add(choice.id);
                    globalUsageCount[choice.id] = (globalUsageCount[choice.id] || 0) + 1;
                    return { ...choice, type: choice.type || 'NORMAL' };
                };

                // 1. Try Unit + Specific Marks
                let p = filterPool(currentPoolByUnitAndMarks[unitId]?.[targetMarks] || [], true);
                if (p.length > 0) return finalize(p);

                // 2. Try Entire Unit
                const allUnitQuestions = [].concat(...Object.values(currentPoolByUnitAndMarks[unitId] || {}) as any);
                p = filterPool(allUnitQuestions, false);
                if (p.length > 0) return finalize(p);

                // 3. Try Anywhere in Subject
                p = filterPool(currentPool, true);
                if (p.length > 0) return finalize(p);

                // 4. Ultimate Fallback
                p = filterPool(currentPool, false);
                return p.length > 0 ? finalize(p) : null;
            };

            const localPickQuestionsForChoice = (mTotal: number, uId: string, hasSub: boolean, exclude: Set<string>, mManual?: (number | undefined)[], _slotType?: string, _bloom?: string[], _co?: string) => {
                if (!hasSub) {
                    const q = localPickOne(mTotal, uId, exclude, _slotType, _bloom, _co);
                    if (q) globalExcluded.add(q.id); // Prevent this question from appearing in NEXT sets
                    return q ? [q] : [];
                } else {
                    const split = (mManual as number[]) || [Number((mTotal / 2).toFixed(1)), Number((mTotal / 2).toFixed(1))];
                    const picked: any[] = [];
                    split.forEach((m, idx) => {
                        const q = localPickOne(m, uId, exclude, _slotType, _bloom, _co);
                        if (q) {
                            globalExcluded.add(q.id);
                            picked.push({ ...q, sub_label: `(${String.fromCharCode(idx + 97)})` });
                        }
                    });
                    return picked;
                }
            };

            for (const slot of slotsToProcess) {
                // Randomize unit order for each slot to ensure variety across sets
                const shuffledUnits = [...unit_ids].sort(() => Math.random() - 0.5);
                let unitId = slot.unit === 'Auto' ? shuffledUnits[autoUnitCounter++ % shuffledUnits.length] : slot.unit;

                if (slot.type === 'SINGLE') {
                    const qArr = localPickQuestionsForChoice(slot.marks, unitId, slot.hasSubQuestions, excludeInSet, slot.hasSubQuestions ? [slot.marks_a, slot.marks_b] : undefined, slot.qType, slot.bloom, slot.co_id);
                    setQuestions.push({
                        id: slot.id, type: 'SINGLE', label: slot.label, part: slot.part,
                        questions: qArr.length > 0 ? qArr.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found]`, marks: slot.marks, part: slot.part }]
                    });
                } else {
                    const c1 = slot.choices?.[0] || { marks: slot.marks };
                    const c2 = slot.choices?.[1] || { marks: slot.marks };

                    const qArr1 = localPickQuestionsForChoice(c1.marks, c1.unit === 'Auto' ? unitId : c1.unit, c1.hasSubQuestions, excludeInSet, c1.hasSubQuestions ? [c1.marks_a, c1.marks_b] : undefined, c1.qType || slot.qType, c1.bloom || slot.bloom, c1.co_id || slot.co_id);
                    const qArr2 = localPickQuestionsForChoice(c2.marks, c2.unit === 'Auto' ? unitId : c2.unit, c2.hasSubQuestions, excludeInSet, c2.hasSubQuestions ? [c2.marks_a, c2.marks_b] : undefined, c2.qType || slot.qType, c2.bloom || slot.bloom, c2.co_id || slot.co_id);

                    setQuestions.push({
                        id: slot.id, type: 'OR_GROUP', label: slot.label, part: slot.part,
                        choices: [
                            { questions: qArr1.length > 0 ? qArr1.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found]`, marks: c1.marks, part: slot.part }] },
                            { questions: qArr2.length > 0 ? qArr2.map(q => ({ ...q, part: slot.part })) : [{ text: `[No question found]`, marks: c2.marks, part: slot.part }] }
                        ]
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
                        generation_mode, template_config, selected_template: body.selected_template
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
