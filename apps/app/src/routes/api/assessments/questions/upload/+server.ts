import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAssessmentQuestion, getCourseOutcomes } from '@uniconnect/shared';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const unitId = formData.get('unitId') as string;
        const subjectId = formData.get('subjectId') as string;
        const mode = (formData.get('mode') as string) || 'normal';

        if (!file || !unitId || !subjectId) {
            throw error(400, 'File, Unit ID, and Subject ID are required');
        }

        let rawText = '';
        const buffer = Buffer.from(await file.arrayBuffer());

        if (file.name.toLowerCase().endsWith('.pdf')) {
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
        } else {
            throw error(400, 'Unsupported file format. Please upload PDF or DOCX.');
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

        const cos = await getCourseOutcomes(subjectId);
        const markers: { index: number, type: string, value: string, fullMatch: string }[] = [];

        const partRegex = /\bPART\s+([A-G])\b/gi;
        const answerKeyRegex = /\bANSWER\s*KEY\b/gi;
        const romanMarkerRegex = /(?:^|\s)(VIII|VII|VI|III|II|IV|IX|I|V|X)[\.\)]\s+/gi;
        const numericMarkerRegex = /(?:^|\s)(\d+|[I-X]+-\d+)[\.\)]\s+/gi;
        const optionMarkerRegex = /(?:^|\s|[\.!\?,]|\))(\([a-d]\)|[a-d][\.\)])(?:\s|$)/gi;

        let match;
        while ((match = partRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'PART', value: match[1].toUpperCase(), fullMatch: match[0] });
        while ((match = answerKeyRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ANS_KEY', value: 'KEY', fullMatch: match[0] });
        while ((match = romanMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'ROMAN', value: match[1].toUpperCase(), fullMatch: match[0] });
        while ((match = numericMarkerRegex.exec(text)) !== null) markers.push({ index: match.index, type: 'NUMBER', value: match[1], fullMatch: match[0] });

        markers.sort((a, b) => a.index - b.index);

        const questionsToCreate: any[] = [];
        let currentType: 'NORMAL' | 'MCQ' | 'SHORT' | 'LONG' = mode === 'mcq' ? 'MCQ' : 'NORMAL';
        let currentRoman = '';
        let currentMarks = 1;

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

                // 3. AGGRESSIVE CLEANUP: Helper to scrub metadata
                const scrub = (t: string) => t
                    .replace(/Bloom's\s*Taxonomy\s*Level:\s*L[1-4]/gi, '')
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
                        unit_id: unitId,
                        question_text: qText || `Question ${rawId}`,
                        marks: mode === 'mcq' ? 1 : currentMarks,
                        co_id: null,
                        bloom_level: 'L1',
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
