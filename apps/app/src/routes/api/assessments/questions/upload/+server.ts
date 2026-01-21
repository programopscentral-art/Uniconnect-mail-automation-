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
                let qType: any = sName.toLowerCase().includes('mcq') ? 'MCQ' :
                    (sName.toLowerCase().includes('long') ? 'LONG' :
                        (sName.toLowerCase().includes('fill') ? 'FILL_IN_BLANK' : 'SHORT'));

                for (const row of rows as any[]) {
                    const qText = findVal(row, ['Question Description', 'Question Text', 'Questions', 'Question'], true);
                    if (!qText || qText.toString().trim().length < 5) continue;

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
                        question_text: qText.toString().trim(),
                        bloom_level: bloomLevel,
                        marks: marks,
                        type: qType,
                        co_id: coCode ? coMap.get(coCode) : null,
                        answer_key: (findVal(row, ['Solution', 'Answer', 'answer_key', 'Correct Answer']) || '').toString().trim(),
                        options: qType === 'MCQ' ? [row['A'], row['B'], row['C'], row['D']].filter(Boolean).map(o => o.toString().trim()) : null,
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
                rawText = result.value.replace(/<tr>/g, '\n[ROW_START]\n').replace(/<\/tr>/g, '\n[ROW_END]\n').replace(/<td>/g, ' [COL] ').replace(/<\/td>/g, ' [/COL] ').replace(/<\/p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/?[^>]+(>|$)/g, " ");

                // Post-process to attach images to questions
                (globalThis as any)._lastDocxImageMap = imageMap;
            } else {
                throw error(400, 'Unsupported file format. Please upload PDF, DOCX, or XLSX.');
            }

            let text = rawText.replace(/\[ROW_START\]|\[ROW_END\]|\[COL\]|\[\/COL\]/g, ' ').replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\s+\n/g, '\n').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-');

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

            let currentType: any = mode === 'mcq' ? 'MCQ' : 'SHORT';
            let currentRoman = '';
            let currentDetectedUnitId = unitId === 'GLOBAL' && allUnits.length > 0 ? allUnits[0].id : unitId;
            const r2n: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };

            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i];
                if (marker.type === 'ANS_KEY') break;
                if (marker.type === 'PART') { currentType = 'SHORT'; continue; }
                if (marker.type === 'ROMAN') { currentRoman = marker.value; continue; }
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

                if (marker.type === 'NUMBER') {
                    const start = marker.index + marker.fullMatch.length;
                    const end = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
                    const bText = text.substring(start, end).trim();

                    let qText = bText;
                    let options: string[] = [];
                    let m; optionMarkerRegex.lastIndex = 0;
                    const oMatches = [];
                    while ((m = optionMarkerRegex.exec(bText)) !== null) oMatches.push({ index: m.index, match: m[0], marker: m[1].trim() });

                    if (oMatches.length > 0) {
                        qText = bText.substring(0, oMatches[0].index).trim();
                        for (let j = 0; j < oMatches.length; j++) {
                            const s = oMatches[j].index + oMatches[j].match.length;
                            const e = oMatches[j + 1] ? oMatches[j + 1].index : bText.length;
                            options.push(`${oMatches[j].marker} ${bText.substring(s, e).trim()}`);
                        }
                    }

                    // Extract Bloom and Marks from text
                    const bMatch = bText.match(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*(L[1-5])/i);
                    const bloomLevelText = bMatch ? bMatch[1].toUpperCase() : 'L1';

                    const mMatch = bText.match(/\((?:Marks?|Pts?|Points?):\s*(\d+)\)/i) || bText.match(/\b(\d+)\s*Marks?\b/i) || bText.match(/\((\d+)\)$/);
                    const marksFromText = mMatch ? parseInt(mMatch[1]) : (options.length > 0 ? 1 : 2);

                    const scrub = (t: string) => t.replace(/Bloom(?:'s)?\s*(?:Taxonomy\s*)?Level:\s*L[1-5]/gi, '').replace(/Topic:\s*[^\n\r\t,]+/gi, '').replace(/\bCO[1-9]\b/gi, '').replace(/Course\s*Outcome:\s*CO[1-9]/gi, '').replace(/\((\d+)\)$/, '').replace(/\b\d+\s*Marks?\b/gi, '').trim();
                    qText = scrub(qText);
                    options = options.map(scrub);

                    // Image detection for DOCX
                    let imageUrl = null;
                    const imgMatch = qText.match(/\[IMG_(\d+)\]/);
                    if (imgMatch) {
                        const imgId = parseInt(imgMatch[1]);
                        imageUrl = ((globalThis as any)._lastDocxImageMap || {})[imgId];
                        qText = qText.replace(/\[IMG_\d+\]/g, '').trim();
                    }

                    if (qText.length > 3 || options.length > 0 || imageUrl) {
                        questionsToCreate.push({
                            unit_id: currentDetectedUnitId === 'GLOBAL' ? allUnits[0].id : currentDetectedUnitId,
                            question_text: qText || (imageUrl ? 'Image-based Question' : `Question ${marker.value}`),
                            marks: marksFromText,
                            bloom_level: bloomLevelText,
                            type: options.length > 0 ? 'MCQ' : currentType,
                            options: options.length > 0 ? options : null,
                            hierarchicalId: currentRoman ? `${currentRoman}-${marker.value}` : marker.value,
                            image_url: imageUrl
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
