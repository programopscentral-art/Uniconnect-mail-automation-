import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, createAssessmentQuestion, getCourseOutcomes } from '@uniconnect/shared';
import { createRequire } from 'module';
import mammoth from 'mammoth';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const require = createRequire(import.meta.url);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const unitId = formData.get('unitId') as string;
        const subjectId = formData.get('subjectId') as string;
        const mode = (formData.get('mode') as string) || 'normal';
        const sheetName = formData.get('sheetName') as string;

        if (!file || !unitId || !subjectId) {
            throw error(400, 'File, Unit ID, and Subject ID are required');
        }

        let rawText = '';
        const buffer = Buffer.from(await file.arrayBuffer());

        if (file.name.toLowerCase().endsWith('.pdf')) {
            const pdf = require('pdf-parse');
            const data = await pdf(buffer);
            rawText = data.text;
        } else if (file.name.toLowerCase().endsWith('.docx')) {
            const options = {
                styleMap: [
                    "p[style-name='Table Paragraph'] => p",
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh"
                ]
            };
            const result = await mammoth.convertToHtml({ buffer }, options);
            rawText = result.value
                .replace(/<tr>/g, '\n[ROW_START]\n')
                .replace(/<\/tr>/g, '\n[ROW_END]\n')
                .replace(/<td>/g, ' [COL] ')
                .replace(/<\/td>/g, ' [/COL] ')
                .replace(/<\/p>/g, '\n')
                .replace(/<br\s*\/?>/g, '\n')
                .replace(/<\/?[^>]+(>|$)/g, " ");
        } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let importCount = 0;

            const subjectUnits = await db.query('SELECT * FROM assessment_units WHERE subject_id = $1', [subjectId]);
            const allUnits = subjectUnits.rows;

            const subjectCos = await getCourseOutcomes(subjectId);
            const coMap = new Map(subjectCos.map(co => [co.code.toUpperCase(), co.id]));

            const sheetsToProcess = sheetName ? [sheetName] : workbook.SheetNames;

            for (const sName of sheetsToProcess) {
                const sheet = workbook.Sheets[sName];
                const rows = XLSX.utils.sheet_to_json(sheet);
                let qType: any = 'SHORT';

                const sNameLow = sName.toLowerCase();
                if (sNameLow.includes('mcq')) qType = 'MCQ';
                else if (sNameLow.includes('long')) qType = 'LONG';
                else if (sNameLow.includes('fill')) qType = 'FILL_IN_BLANK';
                else if (sNameLow.includes('short')) qType = 'SHORT';

                for (const row of rows as any[]) {
                    const qText = row['Questions'] || row['Question'] || row['question_text'] || row['Question Description'];
                    if (!qText) continue;

                    // 1. Resolve Unit
                    const modNum = parseInt(row['Module Number'] || row['Module'] || row['unit_number'] || row['Unit']) || 1;
                    let unit = allUnits.find(u => u.unit_number === modNum);
                    if (!unit) {
                        const res = await db.query(
                            'INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING *',
                            [subjectId, modNum, `Unit ${modNum}`]
                        );
                        unit = res.rows[0];
                        allUnits.push(unit);
                    }

                    // 2. Resolve Topic
                    const topicName = row['Topic name'] || row['Topic'] || row['topic_name'] || 'General';
                    const subjectTopics = await db.query('SELECT * FROM assessment_topics WHERE unit_id = $1 AND name = $2', [unit.id, topicName]);
                    let topic = subjectTopics.rows[0];
                    if (!topic) {
                        const res = await db.query(
                            'INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING *',
                            [unit.id, topicName]
                        );
                        topic = res.rows[0];
                    }

                    // 3. Resolve Bloom Level
                    let bloom = (row['Difficulty level'] || row['Bloom Level'] || row['bloom_level'] || 'L1').toString().toUpperCase().trim();
                    if (!['L1', 'L2', 'L3', 'L4', 'L5'].includes(bloom)) bloom = 'L1';

                    // 4. Resolve Marks
                    let marks = parseInt(row['Marks'] || row['marks'] || (qType === 'MCQ' ? 1 : (qType === 'LONG' ? 10 : 2))) || 2;

                    // 5. Resolve CO
                    const coCode = (row['CO'] || row['Course Outcome'] || row['co_code'] || '').toString().toUpperCase().trim();
                    const coId = coMap.get(coCode) || null;

                    // 6. Create Question
                    await createAssessmentQuestion({
                        unit_id: unit.id,
                        topic_id: topic.id,
                        question_text: qText,
                        bloom_level: bloom,
                        marks: marks,
                        type: qType,
                        co_id: coId || undefined,
                        answer_key: row['Solution'] || row['Answer'] || row['answer_key'] || row['Correct Answer'] || '',
                        options: qType === 'MCQ' ? [row['A'], row['B'], row['C'], row['D']].filter(Boolean) : undefined
                    });
                    importCount++;
                }
            }
            return json({ status: 'success', count: importCount });
        } else {
            throw error(400, 'Unsupported file format. Please upload PDF, DOCX, or XLSX.');
        }

        // 1. IMPROVED NORMALIZATION: Preserve lines but collapse horizontal space
        let text = rawText
            .replace(/\[ROW_START\]|\[ROW_END\]|\[COL\]|\[\/COL\]/g, ' ')
            .replace(/\u00A0/g, ' ') // Replace NBSP with space
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .replace(/\s+\n/g, '\n')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-');

        const subjectCos = await getCourseOutcomes(subjectId);
        const coMap = new Map(subjectCos.map(co => [co.code.toUpperCase(), co.id]));
        const markers: { index: number, type: string, value: string, fullMatch: string }[] = [];

        const partRegex = /\bPART\s+([A-G])\b/gi;
        const answerKeyRegex = /\bANSWER\s*KEY\b/gi;
        const romanMarkerRegex = /(?:^|\s)(VIII|VII|VI|III|II|IV|IX|I|V|X)[\.\)]\s+/gi;
        const numericMarkerRegex = /(?:^|\s)(\d+|[I-X]+-\d+)[\.\)]\s+/gi;
        const optionMarkerRegex = /(?:^|\s|[\.!\?,]|\))(\([a-d]\)|[a-d][\.\)])(?:\s|$)/gi;
        const unitMarkerRegex = /(?:^|\n)(?:Unit|Module|Chapter)[\s-]*(V|IV|III|II|I|1|2|3|4|5|One|Two|Three|Four|Five)[:\s]*/gi;

        let match;
        while ((match = partRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'PART', value: match[1].toUpperCase(), fullMatch: match[0] });
        while ((match = answerKeyRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ANS_KEY', value: 'KEY', fullMatch: match[0] });
        while ((match = romanMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ROMAN', value: match[1].toUpperCase(), fullMatch: match[0] });
        while ((match = numericMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'NUMBER', value: match[1], fullMatch: match[0] });
        while ((match = unitMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'UNIT', value: match[1], fullMatch: match[0] });

        markers.sort((a, b) => a.index - b.index);

        const questionsToCreate: any[] = [];
        let currentType: 'NORMAL' | 'MCQ' | 'SHORT' | 'LONG' = mode === 'mcq' ? 'MCQ' : 'NORMAL';
        let currentRoman = '';
        let currentMarks = 1;

        let currentDetectedUnitId = unitId;
        const subjectUnitsRes = await db.query('SELECT * FROM assessment_units WHERE subject_id = $1 ORDER BY unit_number ASC', [subjectId]);
        const allUnits = subjectUnitsRes.rows;

        if (unitId === 'GLOBAL' && allUnits.length > 0) {
            currentDetectedUnitId = allUnits[0].id;
        }

        const romanToNum: Record<string, number> = {
            'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
            'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5
        };

        for (let i = 0; i < markers.length; i++) {
            const marker = markers[i];
            if (marker.type === 'ANS_KEY') break;
            if (marker.type === 'PART') {
                if (mode !== 'mcq') currentType = 'NORMAL';
                continue;
            }
            if (marker.type === 'ROMAN') {
                currentRoman = marker.value;
                continue;
            }
            if (marker.type === 'UNIT') {
                const val = marker.value.toUpperCase();
                const num = romanToNum[val] || parseInt(val) || 0;
                if (num > 0) {
                    let unit = allUnits.find(u => u.unit_number === num);
                    if (!unit) {
                        const res = await db.query(
                            'INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING *',
                            [subjectId, num, `Unit ${num}`]
                        );
                        unit = res.rows[0];
                        allUnits.push(unit);
                    }
                    currentDetectedUnitId = unit.id;
                }
                continue;
            }

            if (marker.type === 'NUMBER') {
                const start = marker.index + marker.fullMatch.length;
                const end = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
                const blockText = text.substring(start, end).trim();

                let qText = blockText;
                let options: string[] = [];

                // 2. ROBUST OPTION EXTRACTION
                let optionMatches = [];
                let m;
                optionMarkerRegex.lastIndex = 0; // Reset global regex
                while ((m = optionMarkerRegex.exec(blockText)) !== null) {
                    optionMatches.push({ index: m.index, match: m[0], marker: m[1].trim() });
                }

                if (optionMatches.length > 0) {
                    qText = blockText.substring(0, optionMatches[0].index).trim();
                    for (let j = 0; j < optionMatches.length; j++) {
                        const current = optionMatches[j];
                        const next = optionMatches[j + 1];
                        const start = current.index + current.match.length;
                        const end = next ? next.index : blockText.length;
                        const content = blockText.substring(start, end).trim();
                        if (content) options.push(`${current.marker} ${content}`);
                        else options.push(current.marker);
                    }
                }

                const rawId = marker.value;
                const hierarchicalId = (rawId.includes('-')) ? rawId.toUpperCase() : (currentRoman ? `${currentRoman}-${rawId}` : rawId);

                // 3. METADATA EXTRACTION
                let bloomLevel = (blockText.match(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*(L[1-5])/i)?.[1] || 'L1').toUpperCase();

                const coCodeMatch = blockText.match(/\b(CO[1-9])\b/i);
                const coCode = coCodeMatch ? coCodeMatch[1].toUpperCase() : null;
                const coId = coCode ? coMap.get(coCode) : null;

                const topicMatch = blockText.match(/Topic:\s*([^\n\r\t,]+)/i);
                let topicId = null;
                if (topicMatch && currentDetectedUnitId !== 'GLOBAL') {
                    const tName = topicMatch[1].trim();
                    const topicCheck = await db.query('SELECT id FROM assessment_topics WHERE unit_id = $1 AND name = $2', [currentDetectedUnitId, tName]);
                    if (topicCheck.rows.length > 0) {
                        topicId = topicCheck.rows[0].id;
                    } else {
                        const newT = await db.query('INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING id', [currentDetectedUnitId, tName]);
                        topicId = newT.rows[0].id;
                    }
                }

                // 4. AGGRESSIVE CLEANUP: Helper to scrub metadata
                const scrub = (t: string) => t
                    .replace(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*L[1-5]/gi, '')
                    .replace(/Topic:\s*[^\n\r\t,]+/gi, '')
                    .replace(/\bCO[1-9]\b/gi, '')
                    .replace(/Course\s*Outcome:\s*CO[1-9]/gi, '')
                    .trim();

                qText = scrub(qText);
                options = options.map(scrub);

                // Secondary safety: If stray markers like (b) or c. are still in text, strip everything from first one
                optionMarkerRegex.lastIndex = 0;
                const strayMatch = optionMarkerRegex.exec(qText);
                if (strayMatch) {
                    qText = qText.substring(0, strayMatch.index).trim();
                }

                if (qText.length > 3 || options.length > 0) {
                    questionsToCreate.push({
                        unit_id: currentDetectedUnitId === 'GLOBAL' ? undefined : currentDetectedUnitId,
                        topic_id: topicId,
                        question_text: qText || `Question ${rawId}`,
                        marks: mode === 'mcq' ? 1 : currentMarks,
                        co_id: coId || undefined,
                        bloom_level: bloomLevel,
                        answer_key: '',
                        type: options.length > 0 ? 'MCQ' : currentType,
                        options: options,
                        hierarchicalId: hierarchicalId
                    });
                }
            }
        }

        // 4. ROBUST ANSWER KEY MAPPING
        const ansKeyMarker = markers.find(m => m.type === 'ANS_KEY');
        if (ansKeyMarker) {
            const footer = text.substring(ansKeyMarker.index);
            const ansPairs = footer.match(/(\d+|[I-X]+-\d+)\s*[\.\)]?\s*(?:Ans[:\s]+)?(\([a-d]\)|[a-d][\.\)])/gi);
            if (ansPairs) {
                for (const pair of ansPairs) {
                    const idMatch = pair.match(/(\d+|[I-X]+-\d+)/i);
                    const valMatch = pair.match(/(\([a-d]\)|[a-d][\.\)])/i);
                    if (idMatch && valMatch) {
                        const searchId = idMatch[0].toUpperCase();
                        const q = questionsToCreate.find(q =>
                            q.hierarchicalId === searchId ||
                            q.hierarchicalId.endsWith(`-${searchId}`)
                        );
                        if (q) q.answer_key = valMatch[0];
                    }
                }
            }
        }

        // DE-DUPLICATE: If Mammoth repeated some table rows
        const uniqueQuestions = [];
        const seenTexts = new Set();
        for (const q of questionsToCreate) {
            if (!seenTexts.has(q.question_text + q.hierarchicalId)) {
                uniqueQuestions.push(q);
                seenTexts.add(q.question_text + q.hierarchicalId);
            }
        }

        const created = [];
        for (const q of uniqueQuestions) {
            const res = await createAssessmentQuestion(q);
            created.push(res);
        }

        return json({ status: 'success', count: created.length, questions: created });
    } catch (err: any) {
        console.error('Upload Parse Error:', err);
        throw error(500, err.message || 'Failed to parse file');
    }
};
