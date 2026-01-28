import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, getCourseOutcomes } from '@uniconnect/shared';
import { createRequire } from 'module';

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

        const fileName = file.name.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());
        let rawText = '';
        let importCount = 0;

        // DB Caches
        const subjectUnitsRes = await db.query('SELECT * FROM assessment_units WHERE subject_id = $1 ORDER BY unit_number ASC', [subjectId]);
        const allUnits = subjectUnitsRes.rows;

        const subjectTopicsRes = await db.query(`
            SELECT t.* FROM assessment_topics t
            JOIN assessment_units u ON t.unit_id = u.id
            WHERE u.subject_id = $1
        `, [subjectId]);
        const allTopics = subjectTopicsRes.rows;

        const subjectCos = await getCourseOutcomes(subjectId);
        const coMap = new Map(subjectCos.map(co => [co.code.toUpperCase(), co.id]));

        const questionsToCreate: any[] = [];

        const findVal = (row: any, keywords: string[], isContent: boolean = false) => {
            const keys = Object.keys(row);
            for (const kw of keywords) {
                const found = keys.find(k => k.toLowerCase().trim() === kw.toLowerCase().trim());
                if (found) return row[found];
            }
            for (const kw of keywords) {
                const found = keys.find(k => {
                    const lowK = k.toLowerCase();
                    const lowKw = kw.toLowerCase();
                    if (!lowK.includes(lowKw)) return false;
                    if (isContent && (lowK.includes('no.') || lowK.includes('number') || lowK.includes('index'))) return false;
                    return true;
                });
                if (found) return row[found];
            }
            return null;
        };

        // 1. PROCESS XLSX / XLS
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetsToProcess = sheetName ? [sheetName] : workbook.SheetNames;

            for (const sName of sheetsToProcess) {
                const sheet = workbook.Sheets[sName];
                const rows = XLSX.utils.sheet_to_json(sheet);
                const lowName = sName.toLowerCase();
                let qType: any = 'SHORT';
                if (lowName.includes('mcq')) qType = 'MCQ';
                else if (lowName.includes('very long')) qType = 'VERY_LONG';
                else if (lowName.includes('very short')) qType = 'VERY_SHORT';
                else if (lowName.includes('long')) qType = 'LONG';
                else if (lowName.includes('fill')) qType = 'FILL_IN_BLANK';
                else if (lowName.includes('paragraph')) qType = 'PARAGRAPH';

                for (const row of rows as any[]) {
                    const qTextFull = findVal(row, ['Question Description', 'Question Text', 'Questions', 'Question'], true)?.toString().trim();
                    if (!qTextFull || qTextFull.length < 5) continue;

                    let qText = qTextFull;
                    let options: string[] = [row['A'], row['B'], row['C'], row['D']].filter(Boolean).map(o => o.toString().trim());

                    // Aggressive in-text option extraction for XLSX if columns are empty or not enough options
                    if (qTextFull && qTextFull.length > 10) {
                        const optRegex = /(?:\s|^|\()([A-Da-d])[\.\)]\s+/g;
                        const allMatches = [...qTextFull.matchAll(optRegex)];

                        // Look for a sequence starting with 'A' followed by 'B'
                        let bestSplitIndex = -1;
                        let seqMatches: any[] = [];

                        for (let i = 0; i < allMatches.length; i++) {
                            const label = allMatches[i][1].toUpperCase();
                            if (label === 'A') {
                                // Potential start. Check if followed by B
                                if (allMatches[i + 1] && allMatches[i + 1][1].toUpperCase() === 'B') {
                                    bestSplitIndex = allMatches[i].index;
                                    // Collect the full sequence (A, B, C, D)
                                    seqMatches = [allMatches[i]];
                                    let nextChar = 66; // 'B'
                                    for (let j = i + 1; j < allMatches.length; j++) {
                                        if (allMatches[j][1].toUpperCase() === String.fromCharCode(nextChar)) {
                                            seqMatches.push(allMatches[j]);
                                            nextChar++;
                                            if (nextChar > 68) break; // We got A-D
                                        }
                                    }
                                    break;
                                }
                            }
                        }

                        if (bestSplitIndex !== -1 && options.length < 2) {
                            qText = qTextFull.substring(0, bestSplitIndex).trim();
                            options = [];
                            for (let k = 0; k < seqMatches.length; k++) {
                                const s = seqMatches[k].index + seqMatches[k][0].length;
                                const e = seqMatches[k + 1] ? seqMatches[k + 1].index : qTextFull.length;
                                options.push(`${seqMatches[k][1].toUpperCase()}. ${qTextFull.substring(s, e).trim()}`);
                            }
                            if (qType !== 'MCQ') qType = 'MCQ';
                        }
                    }

                    const rawModNum = findVal(row, ['Module Number', 'Unit Number', 'Module #', 'Unit #']);
                    const rawModName = findVal(row, ['NAME OF THE MODULE', 'NAME OF THE UNIT', 'Module Name', 'Unit Name', 'Module', 'Unit']);

                    let unit = null;
                    if (rawModNum && !isNaN(parseInt(rawModNum))) {
                        unit = allUnits.find(u => u.unit_number === parseInt(rawModNum));
                    }
                    if (!unit && rawModName) {
                        const search = rawModName.toString().trim().toLowerCase();
                        unit = allUnits.find(u => (u.name || '').toLowerCase().includes(search) || search.includes((u.name || '').toLowerCase()));
                    }

                    if (!unit) {
                        unit = (unitId !== 'GLOBAL') ? allUnits.find(u => u.id === unitId) : allUnits[0];
                        if (!unit) {
                            const res = await db.query('INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, 1, \'Unit 1\') RETURNING *', [subjectId]);
                            unit = res.rows[0]; allUnits.push(unit);
                        }
                    }

                    const tName = findVal(row, ['Topic name', 'Topic', 'topic_name'])?.toString().trim() || 'General';
                    let topic = allTopics.find(t => t.unit_id === unit.id && t.name.toLowerCase() === tName.toLowerCase());
                    if (!topic) {
                        const res = await db.query('INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING *', [unit.id, tName]);
                        topic = res.rows[0]; allTopics.push(topic);
                    }

                    const bloomRaw = (findVal(row, ['Difficulty level', 'Bloom Level', 'bloom_level', 'Difficulty']) || 'L1').toString().toUpperCase().trim();
                    const bloomMatch = bloomRaw.match(/L\s*([1-5])/i) || bloomRaw.match(/LEVEL\s*([1-5])/i);
                    const bloomLevel = bloomMatch ? `L${bloomMatch[1]}` : (['L1', 'L2', 'L3', 'L4', 'L5'].includes(bloomRaw) ? bloomRaw : 'L1');

                    const marksRaw = findVal(row, ['Marks', 'marks', 'Points', 'Weightage', 'Mark', 'marks_per_q']);
                    const marksNum = parseFloat(marksRaw?.toString());
                    const marks = !isNaN(marksNum) ? marksNum : (qType === 'MCQ' ? 1 : (qType === 'LONG' ? 5 : 2));

                    const coCode = (findVal(row, ['CO', 'Course Outcome', 'co_code']) || '').toString().toUpperCase().trim();

                    questionsToCreate.push({
                        unit_id: unit.id,
                        topic_id: topic.id,
                        co_id: coCode ? coMap.get(coCode) : null,
                        question_text: qText.toString().trim(),
                        bloom_level: bloomLevel,
                        marks: marks,
                        type: qType,
                        answer_key: (findVal(row, ['Solution', 'Answer', 'answer_key', 'Correct Answer']) || '').toString().trim(),
                        options: options && options.length > 0 ? options : null,
                        image_url: null // XLSX image support is limited in current library
                    });
                }
            }
        }
        // 2. PROCESS PDF / DOCX
        else {
            if (fileName.endsWith('.pdf')) {
                const pdf = require('pdf-parse');
                const data = await pdf(buffer); rawText = data.text;
            } else if (fileName.endsWith('.docx')) {
                const mammoth = require('mammoth');
                const imageMap: Record<number, string> = {};
                let imgCounter = 0;

                const options = {
                    styleMap: ["p[style-name='Table Paragraph'] => p", "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh"],
                    convertImage: mammoth.images.inline((element: any) => {
                        return element.read("base64").then((imageBuffer: any) => {
                            const id = ++imgCounter;
                            const dataUri = `data:${element.contentType};base64,${imageBuffer}`;
                            imageMap[id] = dataUri;
                            return { src: `[IMG_${id}]` };
                        });
                    })
                };
                const result = await mammoth.convertToHtml({ buffer }, options);
                rawText = result.value
                    .replace(/<img[^>]+src="(\[IMG_\d+\])"[^>]*>/gi, ' $1 ') // Preserve image marker
                    .replace(/<tr>/g, '\n[ROW_START]\n')
                    .replace(/<\/tr>/g, '\n[ROW_END]\n')
                    .replace(/<td>/g, ' [COL] ')
                    .replace(/<\/td>/g, ' [/COL] ')
                    .replace(/<p[^>]*>/g, '')
                    .replace(/<\/p>/g, '\n')
                    .replace(/<br\s*\/?>/g, '\n')
                    .replace(/<\/?[^>]+(>|$)/g, " "); // Strip other tags

                // Post-process to attach images to questions
                (globalThis as any)._lastDocxImageMap = imageMap;
            } else {
                throw error(400, 'Unsupported file format. Please upload PDF, DOCX, or XLSX.');
            }

            let text = rawText
                .replace(/\[ROW_START\]/g, '\n')
                .replace(/\[ROW_END\]/g, '\n')
                .replace(/\[COL\]/g, ' | ')
                .replace(/\[\/COL\]/g, ' ')
                .replace(/\u00A0/g, ' ')
                .replace(/[ \t]+/g, ' ')
                .replace(/\n\s+/g, '\n')
                .replace(/\s+\n/g, '\n')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[\u2013\u2014]/g, '-');

            const markers: { index: number, type: string, value: string, fullMatch: string, metadata?: any }[] = [];
            const partRegex = /\bPART\s+([A-G])\b/gi;
            const answerKeyRegex = /\bANSWER\s*KEY\b/gi;
            const romanMarkerRegex = /(?:^|\s)(VIII|VII|VI|III|II|IV|IX|I|V|X)[\.\)]\s+/gi;
            const numericMarkerRegex = /(?:^|\s)(\d+|[I-X]+-\d+)[\.\)]\s+/gi;
            const optionMarkerRegex = /(?:^|\s|[\.!\?,]|\))(\([a-d]\)|[a-dA-D][\.\)])(?:\s|$)/gi;
            const unitMarkerRegex = /(?:^|\n)(?:Unit|Module|Chapter)[\s-]*(V|IV|III|II|I|1|2|3|4|5|One|Two|Three|Four|Five)[:\s]*/gi;
            const metaPipeRegex = /(?:^|\n)Q(\d+)\s*\|\s*M(\d+)\s*\|\s*(L[1-5])\s*\|\s*([^|]+)\|\s*(CO[1-9])\s*\|\s*([^|]+)\|\s*([^|\n]+)/gi;
            const headerRegex = /(?:^|\n)\s*(FILL\s*IN\s*THE\s*BLANKS?|SHORT\s*(?:QUESTIONS?|ANSWERS?)|LONG\s*(?:QUESTIONS?|ANSWERS?)|VERY\s*SHORT|MCQ\s*(?:QUESTIONS?|ANSWERS?)|PROGRAMMING|PRACTICALS|DESCRIPTIVE|ESSAY|MATCH\s*THE\s*FOLLOWING)(?:[:\s]|$)/gi;

            let match;
            while ((match = headerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'HEADER', value: match[1].toUpperCase(), fullMatch: match[0] });
            while ((match = metaPipeRegex.exec(text)) !== null) {
                markers.push({
                    index: match.index,
                    type: 'META_PIPE',
                    value: match[1],
                    fullMatch: match[0],
                    metadata: {
                        module: match[2],
                        bloom: match[3],
                        difficulty: match[4].trim(),
                        co: match[5].toUpperCase(),
                        unitName: match[6].trim(),
                        topicName: match[7].trim()
                    }
                });
            }
            while ((match = partRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'PART', value: match[1].toUpperCase(), fullMatch: match[0] });
            while ((match = answerKeyRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ANS_KEY', value: 'KEY', fullMatch: match[0] });
            while ((match = romanMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ROMAN', value: match[1].toUpperCase(), fullMatch: match[0] });
            while ((match = numericMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'NUMBER', value: match[1], fullMatch: match[0] });
            while ((match = unitMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'UNIT', value: match[1], fullMatch: match[0] });

            markers.sort((a, b) => a.index - b.index);

            let currentType: any = mode === 'mcq' ? 'MCQ' : 'SHORT';
            let currentRoman = '';
            let currentDetectedUnitId = unitId === 'GLOBAL' && allUnits.length > 0 ? allUnits[0].id : unitId;
            const r2n: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };

            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i];
                if (marker.type === 'ANS_KEY') break;
                if (marker.type === 'PART') {
                    const context = text.substring(marker.index, marker.index + 50).toUpperCase();
                    if (context.includes('MCQ')) currentType = 'MCQ';
                    else if (context.includes('VERY SHORT')) currentType = 'VERY_SHORT';
                    else if (context.includes('FILL')) currentType = 'FILL_IN_BLANK';
                    else if (context.includes('PARAGRAPH')) currentType = 'PARAGRAPH';
                    else if (context.includes('LONG')) currentType = 'LONG';
                    else currentType = 'SHORT';
                    continue;
                }
                if (marker.type === 'HEADER') {
                    const h = marker.value.replace(/\s+/g, ' ');
                    if (h.includes('FILL')) currentType = 'FILL_IN_BLANK';
                    else if (h.includes('MCQ')) currentType = 'MCQ';
                    else if (h.includes('VERY SHORT')) currentType = 'VERY_SHORT';
                    else if (h.includes('LONG') || h.includes('DESCRIPTIVE') || h.includes('ESSAY')) currentType = 'LONG';
                    else if (h.includes('SHORT') || h.includes('ANSWERS')) currentType = 'SHORT';
                    else currentType = 'SHORT';
                    continue;
                }
                if (marker.type === 'ROMAN') {
                    currentRoman = marker.value;
                    // When starting a new Roman part, reset type to SHORT if it's not explicitly MCQ/Fill
                    if (currentType !== 'MCQ' && currentType !== 'FILL_IN_BLANK') currentType = 'SHORT';
                    continue;
                }
                if (marker.type === 'UNIT') {
                    const n = r2n[marker.value.toUpperCase()] || parseInt(marker.value) || 0;
                    if (n > 0) {
                        let unit = allUnits.find(u => u.unit_number === n);
                        if (!unit) {
                            const res = await db.query('INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING *', [subjectId, n, `Unit ${n}`]);
                            unit = res.rows[0]; allUnits.push(unit);
                        }
                        currentDetectedUnitId = unit.id;
                    }
                    continue;
                }

                if (marker.type === 'NUMBER' || marker.type === 'META_PIPE') {
                    const start = marker.index + marker.fullMatch.length;
                    const end = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
                    let bText = text.substring(start, end).trim();
                    let qText = '';
                    let solutionText = '';
                    let options: string[] = [];
                    let meta = (marker as any).metadata || {};

                    // Universal parsing for "Question:" and "Solution/Answer:" prefixes
                    const sMatch = bText.match(/(?:Solution|Answer|Soln|Ans)\s*:\s*([\s\S]*)/i);
                    if (sMatch) {
                        qText = bText.substring(0, sMatch.index).replace(/Question:\s*/i, '').trim();
                        solutionText = sMatch[1].trim();
                    } else {
                        qText = bText.replace(/Question:\s*/i, '').trim();
                        solutionText = '';
                    }

                    // Specialized parsing for META_PIPE to update unit/co/bloom
                    if (marker.type === 'META_PIPE') {
                        // Override defaults with meta
                        if (meta.module) {
                            const n = parseInt(meta.module);
                            let unit = allUnits.find(u => u.unit_number === n);
                            if (!unit) {
                                const res = await db.query('INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING *', [subjectId, n, meta.unitName || `Unit ${n}`]);
                                unit = res.rows[0]; allUnits.push(unit);
                            }
                            currentDetectedUnitId = unit.id;
                        }
                    }

                    // Improved Option Detection (Supports embedded options)
                    const normalizedText = qText.replace(/[ \t]+/g, ' ');
                    const optRegex = /(?:\s|^|\()([A-Da-d])[\.\)]\s+/g;
                    const allMatches = [...normalizedText.matchAll(optRegex)];

                    let bestIndex = -1;
                    let seq: any[] = [];
                    for (let j = 0; j < allMatches.length; j++) {
                        if (allMatches[j][1].toUpperCase() === 'A' && allMatches[j + 1] && allMatches[j + 1][1].toUpperCase() === 'B') {
                            bestIndex = allMatches[j].index;
                            seq = [allMatches[j]];
                            let nextC = 66;
                            for (let k = j + 1; k < allMatches.length; k++) {
                                if (allMatches[k][1].toUpperCase() === String.fromCharCode(nextC)) {
                                    seq.push(allMatches[k]);
                                    nextC++;
                                    if (nextC > 68) break;
                                }
                            }
                            break;
                        }
                    }

                    if (bestIndex !== -1) {
                        qText = normalizedText.substring(0, bestIndex).trim();
                        options = [];
                        for (let k = 0; k < seq.length; k++) {
                            const s = seq[k].index + seq[k][0].length;
                            const e = seq[k + 1] ? seq[k + 1].index : normalizedText.length;
                            const optT = normalizedText.substring(s, e).trim();
                            if (optT) options.push(`${seq[k][1].toUpperCase()}. ${optT}`);
                        }
                    }

                    // Extract Bloom and Marks from text if not in meta
                    const bloomLevelText = meta.bloom || (bText.match(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*(L[1-5])/i)?.[1].toUpperCase()) || 'L1';

                    const mMatch = bText.match(/\((?:Marks?|Pts?|Points?):\s*(\d+)\)/i) || bText.match(/\b(\d+)\s*Marks?\b/i) || bText.match(/\((\d+)\)$/);
                    let marksFromText = mMatch ? parseInt(mMatch[1]) : (options.length > 0 ? 1 : 2);
                    if (meta.module) {
                        const mVal = parseInt(meta.module);
                        if (!isNaN(mVal) && mVal > 0) marksFromText = mVal;
                    }

                    const cleanText = (t: string) => t.replace(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*L[1-5]/gi, '').replace(/Topic:\s*[^\n\r\t,]+/gi, '').replace(/\bCO[1-9]\b/gi, '').replace(/Course\s*Outcome:\s*CO[1-9]/gi, '').replace(/\((\d+)\)$/, '').replace(/\b\d+\s*Marks?\b/gi, '').trim();

                    // Find Topic ID if present
                    let topicId = null;
                    if (meta.topicName) {
                        let topic = allTopics.find(t => t.unit_id === currentDetectedUnitId && t.name.toLowerCase() === meta.topicName.toLowerCase());
                        if (!topic) {
                            const res = await db.query('INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING *', [currentDetectedUnitId, meta.topicName]);
                            topic = res.rows[0]; allTopics.push(topic);
                        }
                        topicId = topic.id;
                    }

                    // Image detection and conversion back to HTML
                    const lastDocxImageMap = (globalThis as any)._lastDocxImageMap || {};
                    const processImages = (t: string) => {
                        return t.replace(/\[IMG_(\d+)\]/g, (match, id) => {
                            const dUri = lastDocxImageMap[parseInt(id)];
                            return dUri ? `<img src="${dUri}" class="max-w-full rounded-xl my-2 inline-block h-auto" style="max-height: 300px;" />` : match;
                        });
                    };

                    // Extract first image for the main image_url column
                    let imageUrl = null;
                    const mainImgMatch = qText.match(/\[IMG_(\d+)\]/);
                    if (mainImgMatch) {
                        const imgId = mainImgMatch[1];
                        imageUrl = lastDocxImageMap[parseInt(imgId)];
                        // Remove ONLY the first instance of this marker from qText to prevent double rendering
                        qText = qText.replace(`[IMG_${imgId}]`, '').trim();
                    }

                    qText = processImages(qText);
                    solutionText = processImages(solutionText);

                    qText = cleanText(qText);
                    solutionText = cleanText(solutionText);
                    options = options.map(cleanText);

                    let finalType = options.length > 0 ? 'MCQ' : currentType;

                    const qTextLowerForType = qText.toLowerCase();
                    const hasBlankMarkers = qText.includes('___') || qTextLowerForType.includes('fill in the blank');

                    if (hasBlankMarkers) {
                        finalType = 'FILL_IN_BLANK';
                    } else if (options.length === 0) {
                        if (currentType === 'FILL_IN_BLANK' || currentType === 'MCQ') {
                            finalType = (marksFromText >= 5) ? 'LONG' : 'SHORT';
                        }
                    }

                    if (qText.length > 3 || options.length > 0 || imageUrl) {
                        questionsToCreate.push({
                            unit_id: currentDetectedUnitId === 'GLOBAL' ? (allUnits[0]?.id || null) : currentDetectedUnitId,
                            topic_id: topicId,
                            co_id: meta.co ? coMap.get(meta.co) : null,
                            question_text: qText || (imageUrl ? 'Image-based Question' : `Question ${marker.value}`),
                            marks: marksFromText,
                            bloom_level: bloomLevelText,
                            type: finalType,
                            options: options.length > 0 ? options : null,
                            hierarchicalId: currentRoman ? `${currentRoman}-${marker.value}` : marker.value,
                            image_url: imageUrl,
                            answer_key: solutionText || ''
                        });
                    }
                }
            }
            delete (globalThis as any)._lastDocxImageMap;
        }

        // 3. BULK INSERT
        if (questionsToCreate.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < questionsToCreate.length; i += chunkSize) {
                const chunk = questionsToCreate.slice(i, i + chunkSize);
                const valueHolders = chunk.map((_, idx) => `($${idx * 11 + 1}, $${idx * 11 + 2}, $${idx * 11 + 3}, $${idx * 11 + 4}, $${idx * 11 + 5}, $${idx * 11 + 6}, $${idx * 11 + 7}, $${idx * 11 + 8}, $${idx * 11 + 9}, $${idx * 11 + 10}, $${idx * 11 + 11})`).join(', ');
                const params = chunk.flatMap(q => [
                    q.unit_id || null, q.topic_id || null, q.co_id || null, q.question_text, q.bloom_level || 'L1', q.marks || 2, q.type || 'SHORT',
                    q.options ? JSON.stringify(q.options) : null, q.answer_key || '', q.image_url || null, false
                ]);
                await db.query(`INSERT INTO assessment_questions (unit_id, topic_id, co_id, question_text, bloom_level, marks, type, options, answer_key, image_url, is_important) VALUES ${valueHolders}`, params);
                importCount += chunk.length;
            }
        }

        return json({ status: 'success', count: importCount });
    } catch (err: any) {
        console.error('Upload Error:', err);
        throw error(500, err.message || 'Failed to process import');
    }
};
