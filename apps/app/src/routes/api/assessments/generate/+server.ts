import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import crypto from 'node:crypto';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const body = await request.json();

        const sanitizeUUID = (id: any) => (id === '' || id === undefined || id === 'undefined' ? null : id);

        // Seeded random helper for reproducible variety per set
        const createSeededRandom = (seed: number) => {
            return () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };
        };

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

        // 1. Fetch Question Pool (with optional topic filtering)
        // Use DISTINCT ON (q.id) to ensure we don't get duplicates if join on topics yields multiple rows
        let query = `
            SELECT DISTINCT ON (q.id) q.*, t.name as raw_topic_name, u.unit_number 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            LEFT JOIN assessment_topics t ON q.topic_id = t.id
            WHERE u.subject_id = $1
        `;
        const params: any[] = [subject_id];

        if (topic_ids && topic_ids.length > 0) {
            query += ` AND q.topic_id = ANY($2)`;
            params.push(topic_ids);
        }

        const questionsRes = await db.query(query, params);

        // NORMALIZE TOPICS & SHUFFLE
        const allQuestions = questionsRes.rows.map((q: any) => ({
            ...q,
            topic_name: getStrictDisplay(q.raw_topic_name)
        })).sort(() => Math.random() - 0.5);

        const allPossibleUnitIdsArr = [...new Set(allQuestions.map(q => q.unit_id))];

        // 1b. Fetch Course Outcomes for mapping CO1 -> ID
        const coRes = await db.query('SELECT id, code FROM assessment_course_outcomes WHERE subject_id = $1', [subject_id]);
        const coMap = new Map(coRes.rows.map(co => [co.code, co.id]));

        if (allQuestions.length === 0) {
            return json({ error: 'No questions found for this subject. Please upload questions first.' }, { status: 400 });
        }

        // 1c. Paper Identity check
        let isVGUTemplate = String(university_id).toLowerCase().startsWith('c40ed15d') || String(selected_template).toLowerCase().includes('vgu');
        let isCrescentTemplate = String(selected_template).toLowerCase().includes('crescent');
        let isCDUTemplate = String(selected_template).toLowerCase().includes('cdu') || String(selected_template).toLowerCase().includes('chaitanya');

        if (template_id) {
            const templateRes = await db.query('SELECT name, slug, layout_schema FROM assessment_templates WHERE id = $1', [template_id]);
            if (templateRes.rows.length > 0) {
                const tRow = templateRes.rows[0];
                const slug = tRow.slug?.toLowerCase() || '';
                const name = tRow.name?.toLowerCase() || '';
                isVGUTemplate = isVGUTemplate || slug.includes('vgu') || name.includes('vgu');
            }
        }

        // 2. Prepare Slots to Process (STRICTLY FROM template_config)
        if (!template_config || !Array.isArray(template_config)) {
            throw error(400, 'Paper structure configuration (template_config) is missing or invalid.');
        }

        const slotsToProcess: any[] = [];
        template_config.forEach((section: any) => {
            const part = section.part || section.section || (section.title?.toUpperCase()?.includes('PART A') ? 'A' : (section.title?.toUpperCase()?.includes('PART B') ? 'B' : 'C'));

            if (!section.slots || !Array.isArray(section.slots)) {
                throw error(400, `Section ${section.title || part} is missing slots.`);
            }

            section.slots.forEach((slot: any) => {
                slotsToProcess.push({
                    ...slot,
                    id: slot.id || crypto.randomUUID(),
                    marks: Number(slot.marks || section.marks_per_q || 0),
                    part: part,
                    section_title: section.title,
                    // If qType is missing, infer from section or name
                    qType: slot.qType || 'ANY',
                    co_id: slot.target_co ? coMap.get(slot.target_co) : slot.co_id
                });
            });
        });

        // Common declarations for all templates
        const sets = ['A', 'B', 'C', 'D'];
        const generatedSets: Record<string, any> = {};
        const globalExcluded = new Set<string>();
        const globalExcludedTexts = new Set<string>();
        const globalShuffledPool = [...allQuestions];
        for (let i = globalShuffledPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [globalShuffledPool[i], globalShuffledPool[j]] = [globalShuffledPool[j], globalShuffledPool[i]];
        }

        const setDebugInfo: Record<string, any> = {};

        for (const setName of sets) {
            // Seeded randomness per set
            const setSeed = (Date.now() % 100000) + (setName.charCodeAt(0) * 1000) + Math.floor(Math.random() * 1000);
            const random = createSeededRandom(setSeed);

            const setQuestions: any[] = [];
            const excludeInSet = new Set<string>();
            let setUnitIdx = 0;

            const pickStrict = (qType: string, targetMarks: number, uId: string, sectionTitle: string) => {
                // Map frontend type to backend type if needed
                let searchType = qType?.toUpperCase() || 'ANY';
                if (searchType === 'NORMAL') searchType = 'ANY';

                let pool = allQuestions.filter((q: any) => {
                    if (excludeInSet.has(q.id)) return false;

                    // 1. Strict Topic Filtering (If topic_ids provided from UI)
                    if (topic_ids && topic_ids.length > 0) {
                        if (!topic_ids.includes(q.topic_id)) return false;
                    }

                    // 2. Unit Filtering
                    if (uId !== 'Auto' && q.unit_id !== uId) return false;

                    // 3. Mark check
                    if (Number(q.marks) !== Number(targetMarks)) return false;

                    // 4. Type check
                    if (searchType === 'MCQ') {
                        return q.type === 'MCQ' || (Array.isArray(q.options) && q.options.length > 0);
                    }
                    if (searchType === 'FILL_IN_BLANK') {
                        return q.type === 'FILL_IN_BLANK' || q.type === 'FIB';
                    }
                    if (searchType === 'SHORT') {
                        return q.type === 'SHORT' || (Number(q.marks) >= 2 && Number(q.marks) <= 3);
                    }
                    if (searchType === 'LONG') {
                        return !['MCQ', 'FILL_IN_BLANK', 'FIB'].includes(q.type) && Number(q.marks) >= 4;
                    }

                    return true;
                });

                if (pool.length === 0) {
                    throw new Error(`Insufficient ${searchType} questions available for section "${sectionTitle}" (Unit: ${uId}, Topics: ${topic_ids?.length || 'All'}). Required marks: ${targetMarks}.`);
                }

                // 5. Within-Set Text Deduplication (using extreme normalization)
                const usedTextsInSet = new Set(setQuestions.flatMap(sq => {
                    const qs = sq.type === 'OR_GROUP'
                        ? [...(sq.choice1?.questions || []), ...(sq.choice2?.questions || [])]
                        : (sq.questions || []);
                    return qs.map((q: any) => normalizeText(q.question_text));
                }));

                const deDupedPool = pool.filter((q: any) => !usedTextsInSet.has(normalizeText(q.question_text)));

                if (deDupedPool.length === 0) {
                    throw new Error(`Insufficient unique questions for section "${sectionTitle}" (Unit: ${uId}). The pool only contains duplicates of already selected questions.`);
                }

                // Pick from units specified in generation or pool
                let choicePool = deDupedPool;
                if (uId === 'Auto') {
                    const targetUnitId = (unit_ids && unit_ids.length > 0)
                        ? (unit_ids[setUnitIdx % unit_ids.length])
                        : allPossibleUnitIdsArr[setUnitIdx % allPossibleUnitIdsArr.length];

                    const unitCand = deDupedPool.filter((q: any) => q.unit_id === targetUnitId);
                    if (unitCand.length > 0) choicePool = unitCand;
                    setUnitIdx++;
                }

                // Variety across sets (A, B, C, D) using extreme normalization
                const varietyPool = choicePool.filter((q: any) => !globalExcluded.has(q.id));
                const textVarietyPool = (varietyPool.length > 0 ? varietyPool : choicePool).filter((q: any) => {
                    return !globalExcludedTexts.has(normalizeText(q.question_text));
                });

                const finalPool = textVarietyPool.length > 0 ? textVarietyPool : (varietyPool.length > 0 ? varietyPool : choicePool);
                const choice = finalPool[Math.floor(random() * finalPool.length)];

                excludeInSet.add(choice.id);
                globalExcluded.add(choice.id);
                globalExcludedTexts.add(normalizeText(choice.question_text));

                const coCode = coRes.rows.find(c => c.id === choice.co_id)?.code || 'CO1';

                return {
                    id: choice.id,
                    question_id: choice.id,
                    text: choice.question_text,
                    question_text: choice.question_text,
                    marks: targetMarks,
                    bloomLevel: choice.bloom_level,
                    k_level: choice.bloom_level ? `K${choice.bloom_level.replace(/[^0-9]/g, '') || '1'}` : 'K1',
                    co: coCode,
                    target_co: coCode,
                    options: choice.options,
                    image_url: choice.image_url,
                    type: choice.type,
                    unit: choice.unit_number,
                    topic: choice.topic_name,
                    unit_id: choice.unit_id,
                    topic_id: choice.topic_id
                };
            };

            for (const slot of slotsToProcess) {
                const uId = slot.unit === 'Auto' ? (unit_ids[setUnitIdx++ % unit_ids.length] || allPossibleUnitIdsArr[0]) : slot.unit;

                if (slot.type === 'OR_GROUP') {
                    const q1 = pickStrict(slot.qType || 'LONG', slot.marks, uId, slot.section_title);
                    const q2 = pickStrict(slot.qType || 'LONG', slot.marks, uId, slot.section_title);
                    setQuestions.push({
                        id: slot.id,
                        slot_id: slot.slot_id,
                        type: 'OR_GROUP',
                        part: slot.part,
                        marks: slot.marks,
                        choice1: { questions: [q1] },
                        choice2: { questions: [q2] }
                    });
                } else {
                    const q = pickStrict(slot.qType, slot.marks, uId, slot.section_title);
                    setQuestions.push({
                        id: slot.id,
                        slot_id: slot.slot_id,
                        type: 'SINGLE',
                        part: slot.part,
                        marks: slot.marks,
                        questions: [q]
                    });
                }
            }

            generatedSets[setName] = { questions: setQuestions, setName };
            setDebugInfo[setName] = {
                seed: setSeed,
                questionIds: setQuestions.flatMap(s => s.type === 'OR_GROUP' ? [...s.choice1.questions.map((q: any) => q.id), ...s.choice2.questions.map((q: any) => q.id)] : s.questions.map((q: any) => q.id))
            };
        }

        // Overlap Validation
        console.log("=== GENERATION OVERLAP VALIDATION ===");
        for (let i = 0; i < sets.length; i++) {
            for (let j = i + 1; j < sets.length; j++) {
                const set1Ids = new Set(setDebugInfo[sets[i]].questionIds);
                const intersection = setDebugInfo[sets[j]].questionIds.filter((id: string) => set1Ids.has(id));
                const overlap = (intersection.length / Math.max(set1Ids.size, 1)) * 100;
                console.log(`[OVERLAP] Set ${sets[i]} vs Set ${sets[j]}: ${overlap.toFixed(2)}% overlap`);
                if (overlap === 100) {
                    throw new Error(`Invalid generation: Set ${sets[i]} and Set ${sets[j]} are identical. Check question pool diversity.`);
                }
                if (overlap > 30) {
                    console.warn(`[WARNING] High overlap detected between Set ${sets[i]} and ${sets[j]}: ${overlap.toFixed(2)}%`);
                }
            }
        }

        if (preview_only) {
            return json({ sets: generatedSets, template_config, debug: setDebugInfo });
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
                    debug: setDebugInfo,
                    metadata: {
                        unit_ids,
                        generation_mode,
                        part_a_type,
                        sets_config,
                        selected_template: isVGUTemplate ? 'vgu' : selected_template,
                        exam_time,
                        course_code,
                        exam_title,
                        instructions,
                        template_config
                    }
                })
            ]
        );

        return json({ id: paperRes.rows[0].id, sets: generatedSets, template_config, debug: setDebugInfo });
    } catch (err: any) {
        console.error('Generation Error:', err);
        throw error(500, err.message || 'Failed to generate paper');
    }
};
