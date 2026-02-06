import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';

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
            generation_mode = 'Automatic', // 'Automatic' or 'Modifiable'
            max_marks = 50,
            part_a_type = 'Mixed',
            sets_config = {}, // { 'A': ['L1'], 'B': ['L2'], ... }
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

        // 1. Fetch Question Pool (with optional topic filtering)
        let query = `
            SELECT q.*, t.name as topic_name, u.unit_number 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            LEFT JOIN assessment_topics t ON q.topic_id = t.id
            WHERE u.subject_id = $1
        `;
        const params: any[] = [subject_id];

        if (topic_ids && topic_ids.length > 0) {
            query += ` AND q.topic_id = ANY($2)`;
            params.push(topic_ids);
        } else if (unit_ids && unit_ids.length > 0) {
            // Note: unit_ids passed from frontend are compared here
            // If topic_ids are NOT provided, we still respect unit_ids as a fallback filter if the pool is large
            // But the current implementation usually sends all possible units and filters in the picker logic
            // However, to be strict as requested for unit-wise selection:
            // query += ` AND q.unit_id = ANY($2)`;
            // params.push(unit_ids);
        }

        const questionsRes = await db.query(query, params);

        const allQuestions = questionsRes.rows;
        const allPossibleUnitIdsArr = [...new Set(allQuestions.map(q => q.unit_id))];

        // 1b. Fetch Course Outcomes for mapping CO1 -> ID
        const coRes = await db.query('SELECT id, code FROM assessment_course_outcomes WHERE subject_id = $1', [subject_id]);
        const coMap = new Map(coRes.rows.map(co => [co.code, co.id]));

        if (allQuestions.length === 0) {
            return json({ error: 'No questions found for this subject. Please upload questions first.' }, { status: 400 });
        }

        // 1c. Fetch Template Layout for Slot Mapping (V62)
        let figmaSlots: any[] = [];
        let isVGUTemplate = false;
        let isCrescentTemplate = false;
        let isCDUTemplate = false;
        if (template_id) {
            const templateRes = await db.query('SELECT name, slug, layout_schema FROM assessment_templates WHERE id = $1', [template_id]);
            if (templateRes.rows.length > 0) {
                const tRow = templateRes.rows[0];
                const slug = tRow.slug?.toLowerCase() || '';
                const name = tRow.name?.toLowerCase() || '';
                isVGUTemplate = slug.includes('vgu') || name.includes('vgu');
                isCrescentTemplate = slug.includes('crescent') || name.includes('crescent');
                isCDUTemplate = slug.includes('cdu') || name.includes('chaitanya');
                const schema = tRow.layout_schema;
                // V94: Support both Legacy (pages array) and Canonical (slots record)
                if (schema?.slots && !Array.isArray(schema.slots)) {
                    figmaSlots = Object.entries(schema.slots).map(([name, slot]: [string, any]) => ({
                        ...slot,
                        slot_id: name // Map key to slot_id for legacy compatibility
                    }));
                } else {
                    figmaSlots = schema?.pages?.[0]?.elements?.filter((el: any) => el.slot_id) || [];
                }
            }
        }

        // 2. Prepare Slots to Process
        const slotsToProcess: any[] = [];
        if (generation_mode === 'Modifiable' && template_config) {
            template_config.forEach((section: any) => {
                const part = section.part || (section.title?.toUpperCase()?.includes('PART A') ? 'A' : (section.title?.toUpperCase()?.includes('PART B') ? 'B' : 'C'));
                section.slots.forEach((slot: any) => {
                    slotsToProcess.push({
                        ...slot,
                        id: slot.id || crypto.randomUUID(),
                        marks: slot.marks || section.marks_per_q,
                        part: part,
                        co_id: slot.target_co ? coMap.get(slot.target_co) : slot.co_id
                    });
                });
            });
        } else {
            const isChaitanya = university_id === '8e5403f9-505a-44d4-add4-aae3efaa9248' || String(selected_template).toLowerCase() === 'cdu';
            const is100 = Number(max_marks) === 100;
            const isMCQ = part_a_type === 'MCQ';
            const isMixed = part_a_type === 'Mixed';

            const countA = isChaitanya ? 10 : (is100 ? (isMCQ ? 20 : 10) : (isMCQ ? 10 : 5));
            const marksA = isChaitanya ? 2 : (isMCQ ? 1 : 2);
            const typeA = isMixed ? 'MIXED' : (isMCQ ? 'MCQ' : 'NORMAL');

            for (let i = 1; i <= countA; i++) {
                slotsToProcess.push({
                    id: crypto.randomUUID(),
                    label: `${i}`,
                    marks: marksA,
                    type: 'SINGLE',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: typeA,
                    part: 'A'
                });
            }

            const realCountB = isChaitanya ? 2 : (is100 ? 5 : 8);
            for (let i = 0; i < realCountB; i++) {
                const marksB = isChaitanya ? 4 : (is100 ? 16 : 5);
                const startNum = countA + 1 + i * 2;
                slotsToProcess.push({
                    id: crypto.randomUUID(),
                    label: `${startNum}`,
                    displayLabel: `${startNum} OR ${startNum + 1}`,
                    marks: marksB,
                    type: 'OR_GROUP',
                    unit: 'Auto',
                    hasSubQuestions: false,
                    qType: 'NORMAL',
                    part: 'B',
                    choices: [
                        { label: `${startNum}`, unit: 'Auto', marks: marksB, hasSubQuestions: false, qType: 'NORMAL' },
                        { label: `${startNum + 1}`, unit: 'Auto', marks: marksB, hasSubQuestions: false, qType: 'NORMAL' }
                    ]
                });
            }

            if (!template_config || isVGUTemplate || isCrescentTemplate || isCDUTemplate) {
                // If we have Figma slots, we align the config with the slots
                if (figmaSlots.length > 0) {
                    // Determine Part A/B slots more robustly (VGU uses Q_1..10 for A, Q_11..14 for B)
                    let partASlots = figmaSlots.filter(s => s.slot_id.startsWith('PART_A') && s.slot_id.endsWith('_TEXT'));
                    let partBSlots = figmaSlots.filter(s => s.slot_id.startsWith('PART_B') && s.slot_id.endsWith('_TEXT'));

                    if (isVGUTemplate) {
                        // VGU Specific Slot Logic
                        partASlots = figmaSlots.filter(s => {
                            const num = parseInt(s.slot_id.replace('Q_', ''));
                            return !isNaN(num) && num <= 10;
                        }).sort((a, b) => parseInt(a.slot_id.replace('Q_', '')) - parseInt(b.slot_id.replace('Q_', '')));

                        partBSlots = figmaSlots.filter(s => {
                            const num = parseInt(s.slot_id.replace('Q_', ''));
                            return !isNaN(num) && num > 10;
                        }).sort((a, b) => parseInt(a.slot_id.replace('Q_', '')) - parseInt(b.slot_id.replace('Q_', '')));
                    }

                    template_config = [
                        {
                            title: isVGUTemplate ? 'Section A (1*10=10 Marks) Answer all Question No- 1-10' : 'PART A',
                            marks_per_q: isVGUTemplate ? 1 : marksA,
                            count: partASlots.length,
                            answered_count: isVGUTemplate ? 10 : partASlots.length,
                            slots: partASlots.map((s, i) => ({
                                id: s.id,
                                slot_id: s.slot_id,
                                label: `${i + 1}`,
                                marks: isVGUTemplate ? 1 : marksA,
                                type: 'SINGLE',
                                qType: isVGUTemplate ? 'MCQ' : 'ANY', // FORCE MCQ FOR VGU PART A
                                part: 'A'
                            }))
                        },
                        {
                            title: isVGUTemplate ? 'Section B (5*3=15 Marks) Attempt any three questions' : 'PART B',
                            marks_per_q: isVGUTemplate ? 5 : (is100 ? 16 : 5),
                            count: partBSlots.length,
                            answered_count: isVGUTemplate ? 3 : partBSlots.length,
                            slots: partBSlots.map((s, i) => ({
                                id: s.id,
                                slot_id: s.slot_id,
                                label: `Q.${partASlots.length + i + 1}`,
                                marks: isVGUTemplate ? 5 : (is100 ? 16 : 5),
                                type: 'SINGLE',
                                qType: isVGUTemplate ? 'LONG' : 'ANY', // FORCE LONG FOR VGU PART B
                                part: 'B'
                            }))
                        }
                    ];
                    slotsToProcess.length = 0; // Clear auto-generated slots
                    slotsToProcess.push(...template_config[0].slots, ...template_config[1].slots);
                } else {
                    template_config = [
                        { title: 'PART A', marks_per_q: marksA, count: countA, slots: slotsToProcess.filter(s => s.part === 'A') },
                        { title: 'PART B', marks_per_q: is100 ? 16 : 5, count: realCountB, slots: slotsToProcess.filter(s => s.part === 'B') }
                    ];
                }
            }
        }

        // 2a. Shuffle pool for variety
        // 2a. Shuffle pool for variety (Fisher-Yates)
        const globalShuffledPool = [...allQuestions];
        for (let i = globalShuffledPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [globalShuffledPool[i], globalShuffledPool[j]] = [globalShuffledPool[j], globalShuffledPool[i]];
        }

        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const globalExcluded = new Set<string>(); // Tracking VARIETY across sets

        for (const setName of sets) {
            const setQuestions: any[] = [];
            const setDifficulty = sets_config[setName] || ['ANY'];
            const excludeInSet = new Set<string>();

            // Randomize unit order for each set to ensure different question distribution (Fisher-Yates)
            const shuffledUnitIds = [...unit_ids];
            for (let i = shuffledUnitIds.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledUnitIds[i], shuffledUnitIds[j]] = [shuffledUnitIds[j], shuffledUnitIds[i]];
            }
            let setUnitCounter = 0;

            const pickOne = (targetMarks: number, unitId: string, qType?: string, bloomArr?: string[], co_id?: string) => {
                const isShortOrMcq = (q: any) => {
                    const text = (q.question_text || '').toLowerCase();
                    return text.includes('___') || text.includes('....') || (Array.isArray(q.options) && q.options.length > 0);
                };

                const getCandidates = (pool: any[], strictMarks: boolean, strictBloom: boolean, allowGlobalReuse: boolean) => {
                    let cand = pool;

                    // 1. Uniqueness Filter (Most Important)
                    if (!allowGlobalReuse) {
                        cand = cand.filter(q => !excludeInSet.has(q.id) && !globalExcluded.has(q.id));
                    } else {
                        cand = cand.filter(q => !excludeInSet.has(q.id));
                    }

                    if (cand.length === 0) return [];

                    // 1b. CO Filter (High Priority)
                    if (co_id) {
                        const coCand = cand.filter(q => q.co_id === co_id);
                        if (coCand.length > 0) cand = coCand;
                        // No fallback for CO - if a slot is mapped to CO, we stay strict or handle it in picking attempts
                    }

                    // 2. Marks Filter
                    if (strictMarks) {
                        const mCand = cand.filter(q => Number(q.marks) === Number(targetMarks));
                        if (mCand.length > 0) cand = mCand;
                        else {
                            // Lenient Marks (+/- 1)
                            const lCand = cand.filter(q => Math.abs(Number(q.marks) - Number(targetMarks)) <= 1);
                            if (lCand.length > 0) cand = lCand;
                        }
                    }

                    // 3. Bloom Filter
                    if (strictBloom && bloomArr && bloomArr.length > 0 && !bloomArr.includes('ANY')) {
                        const bCand = cand.filter(q => bloomArr.includes(q.bloom_level));
                        if (bCand.length > 0) cand = bCand;
                    }

                    // 4. Type Filter
                    if (qType && qType !== 'ANY') {
                        if (qType === 'MIXED') cand = cand.filter(q => ['MCQ', 'FILL_IN_BLANK', 'VERY_SHORT', 'SHORT', 'LONG', 'VERY_LONG', 'PARAGRAPH'].includes(q.type || '') || isShortOrMcq(q));
                        else if (qType === 'MCQ') cand = cand.filter(q => q.type === 'MCQ' || isShortOrMcq(q));
                        else if (qType === 'NORMAL' && targetMarks < 5) cand = cand.filter(q => !['MCQ', 'FILL_IN_BLANK'].includes(q.type || '') && !isShortOrMcq(q));
                        else cand = cand.filter(q => q.type === qType);
                    }

                    return cand;
                };

                const finalize = (cand: any[]) => {
                    // Random pick from best available candidates
                    const choice = cand[Math.floor(Math.random() * cand.length)];
                    excludeInSet.add(choice.id);
                    globalExcluded.add(choice.id);

                    // Map bloom_level to k_level for VGU
                    const kLevel = choice.bloom_level ?
                        (choice.bloom_level.startsWith('K') ? choice.bloom_level : `K${choice.bloom_level.charAt(0)}`)
                        : 'K1';

                    // STRICT DEEP CLONE to prevent shared reference mutation bugs
                    return {
                        id: choice.id,
                        text: choice.question_text,
                        marks: choice.marks,
                        bloom: choice.bloom_level,
                        k_level: kLevel,
                        co_indicator: choice.target_co || 'CO1',
                        co_id: choice.co_id,
                        unit_id: choice.unit_id,
                        type: choice.type || 'NORMAL',
                        options: Array.isArray(choice.options) ? [...choice.options] : null,
                        image_url: choice.image_url
                    };
                };

                const unitPool = globalShuffledPool.filter(q => q.unit_id === unitId);
                const globalPool = globalShuffledPool;

                // VARIETY-FIRST FALLBACK CHAIN
                // The goal is to traverse sets without repeating questions if possible.
                const attempts = [
                    // Priority 1: Fresh in Unit + Strict Marks + Strict Bloom
                    () => getCandidates(unitPool, true, true, false),
                    // Priority 2: Fresh in Unit + Strict Marks + Any Bloom (VARIETY OVER DIFFICULTY)
                    () => getCandidates(unitPool, true, false, false),
                    // Priority 3: Fresh in Global + Strict Marks + Any Bloom
                    () => getCandidates(globalPool, true, false, false),
                    // Priority 4: Reuse in Unit + Strict Marks + Strict Bloom (BLOOM OVER REUSE)
                    () => getCandidates(unitPool, true, true, true),
                    // Priority 5: Reuse in Global + Any Marks (LAST RESORT)
                    () => getCandidates(globalPool, false, false, true)
                ];

                for (const attempt of attempts) {
                    const c = attempt();
                    if (c.length > 0) return finalize(c);
                }

                return null;
            };

            const pickChoice = (marks: number, uId: string, hasSub: boolean, subMarks?: number[], qType?: string, bloomArr?: string[], co?: string) => {
                const finalBloom = (bloomArr && !bloomArr.includes('ANY')) ? bloomArr : setDifficulty;
                if (!hasSub) {
                    const q = pickOne(marks, uId, qType, finalBloom, co);
                    return q ? [q] : [];
                } else {
                    const split = subMarks || [Number((marks / 2).toFixed(1)), Number((marks / 2).toFixed(1))];
                    const picked: any[] = [];
                    split.forEach((m, idx) => {
                        const q = pickOne(m, uId, qType, finalBloom, co);
                        if (q) picked.push({ ...q, sub_label: `(${String.fromCharCode(idx + 97)})` });
                    });
                    return picked;
                }
            };

            for (const slot of slotsToProcess) {
                // Unit shuffling per set is happening here via shuffledUnitIds and setUnitCounter
                const uToUse = slot.unit === 'Auto' ? (shuffledUnitIds[setUnitCounter++ % shuffledUnitIds.length] || allPossibleUnitIdsArr[0]) : slot.unit;

                if (slot.type === 'OR_GROUP') {
                    const c1 = pickChoice(slot.marks, uToUse, slot.hasSubQuestions, slot.choices?.[0]?.manualMarks, slot.qType, slot.bloom, slot.co_id || slot.co);
                    const c2 = pickChoice(slot.marks, uToUse, slot.hasSubQuestions, slot.choices?.[1]?.manualMarks, slot.qType, slot.bloom, slot.co_id || slot.co);
                    setQuestions.push({ id: slot.id, type: 'OR_GROUP', part: slot.part, choice1: { questions: c1 }, choice2: { questions: c2 } });
                } else {
                    const qs = pickChoice(slot.marks, uToUse, slot.hasSubQuestions, slot.subMarks, slot.qType, slot.bloom, slot.co_id || slot.co);
                    setQuestions.push({
                        id: slot.id,
                        slot_id: slot.slot_id, // Pass slot_id to the resulting questions array
                        type: 'SINGLE',
                        part: slot.part,
                        questions: qs,
                        marks: slot.marks
                    });
                }
            }
            generatedSets[setName] = { questions: setQuestions, setName };
        }

        if (preview_only) {
            return json({ sets: generatedSets, template_config });
        }

        // 3. PERSIST THE PAPER
        const paperRes = await db.query(
            `INSERT INTO assessment_papers (
                university_id, batch_id, branch_id, subject_id, 
                exam_type, semester, paper_date, 
                duration_minutes, max_marks, template_id, sets_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
            [
                university_id, batch_id, branch_id, subject_id,
                exam_type ?? 'MID1', semester, paper_date,
                duration_minutes, max_marks, template_id,
                JSON.stringify({
                    ...generatedSets,
                    metadata: {
                        unit_ids,
                        generation_mode,
                        part_a_type,
                        sets_config,
                        selected_template,
                        exam_time,
                        course_code,
                        exam_title,
                        instructions
                    }
                })
            ]
        );

        return json({ id: paperRes.rows[0].id, sets: generatedSets, template_config });
    } catch (err: any) {
        console.error('Generation Error:', err);
        throw error(500, err.message || 'Failed to generate paper');
    }
};
