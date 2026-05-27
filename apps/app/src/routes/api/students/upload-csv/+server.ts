import { createStudentsBulk } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { parse } from 'csv-parse/sync';
import { parseExcel } from '$lib/server/excel';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    let universityId = formData.get('universityId') as string;
    const sheetName = formData.get('sheetName') as string;

    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id!;
    }

    if (!universityId || !file) {
        throw error(400, 'University ID and file are required');
    }

    try {
        let records: any[] = [];
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

        if (isExcel) {
            const arrayBuffer = await file.arrayBuffer();
            records = parseExcel(Buffer.from(arrayBuffer), sheetName);
        } else {
            const text = await file.text();
            records = parse(text, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });
        }

        if (records.length === 0) {
            return json({ count: 0, message: 'File is empty' });
        }

        const getValueByKeywords = (row: any, keywords: string[], isStudentEmail = false) => {
            const keys = Object.keys(row);
            // Added university and college to exclusions for name parsing
            const excludeKeywords = ['father', 'mother', 'parent', 'guardian', 'secondary', 'witness', 'university', 'college', 'school', 'institute', 'univ'];

            // 1. Try EXACT matches first for prioritized keywords
            for (const keyword of keywords) {
                const foundKey = keys.find(k => k.toLowerCase().trim() === keyword.toLowerCase().trim());
                if (foundKey && row[foundKey] && String(row[foundKey]).trim() !== '') {
                    return { key: foundKey, value: String(row[foundKey]).trim() };
                }
            }

            // 2. Try PARTIAL matches for prioritized keywords if no exact match found
            for (const keyword of keywords) {
                const foundKey = keys.find(k => {
                    const lowKey = k.toLowerCase().trim();
                    const lowKeyword = keyword.toLowerCase().trim();

                    // If searching for generic 'name', be extra careful not to match university/college
                    const matches = lowKey.includes(lowKeyword);

                    if (matches) {
                        const hasExclude = excludeKeywords.some(ex => lowKey.includes(ex));
                        if (hasExclude) return false;

                        // Special case: if we are looking for student name, don't match if it looks like a university-level field
                        if (!isStudentEmail && (lowKey.includes('university') || lowKey.includes('college') || lowKey.includes('admission'))) {
                            return false;
                        }
                    }

                    return matches;
                });

                if (foundKey && row[foundKey] && String(row[foundKey]).trim() !== '') {
                    return { key: foundKey, value: String(row[foundKey]).trim() };
                }
            }
            return null;
        };

        const nameAliases = [
            'student full name', 'student name', 'full name', 'candidate name', 'name', 'fname',
            'name of the student', 'name of candidate', 'student_name', 'full_name'
        ];
        const emailAliases = [
            'student personal mail id', 'personal mail id', 'student email', 'candidate email',
            'email address', 'email id', 'email', 'personal email', 'mail id', 'mail',
            'student_email', 'college email', 'university email'
        ];
        const idAliases = [
            'niat id', 'admnno', 'roll no', 'student id', 'external id', 'id', 'uid',
            'admission no', 'registration no', 'reg no', 'roll number', 'student_id'
        ];

        const students: any[] = [];
        const skippedRows: any[] = [];

        // Regex patterns for parent-contact canonical aliases. Match against
        // a normalized form of each column key (lowercase, underscores/dots →
        // space, multi-space collapsed) so all of these resolve correctly:
        //   "Father Email", "Father's Email", "Father Mail ID",
        //   "Fathers Mail ID", "FATHER EMAIL ID", "father_email",
        //   "father.email", "Father Personal Mail Id", "Father E-Mail"
        // The optional possessive 's' covers both with and without apostrophe.
        const aliasPatterns: Array<{ canonical: string; pattern: RegExp }> = [
            { canonical: 'father_email',   pattern: /^father'?s?\s*(personal\s*)?(e[\-\s]?mail|mail)(\s*(id|address))?$/i },
            { canonical: 'mother_email',   pattern: /^mother'?s?\s*(personal\s*)?(e[\-\s]?mail|mail)(\s*(id|address))?$/i },
            { canonical: 'guardian_email', pattern: /^(guardian|parent)'?s?\s*(personal\s*)?(e[\-\s]?mail|mail)(\s*(id|address))?$/i },
            { canonical: 'father_phone',   pattern: /^father'?s?\s*(phone|mobile|contact|number|whatsapp|cell)(\s*(no|number))?$/i },
            { canonical: 'mother_phone',   pattern: /^mother'?s?\s*(phone|mobile|contact|number|whatsapp|cell)(\s*(no|number))?$/i },
            { canonical: 'father_name',    pattern: /^father'?s?\s*(name|full\s*name)$/i },
            { canonical: 'mother_name',    pattern: /^mother'?s?\s*(name|full\s*name)$/i },
        ];

        function normalizeHeader(k: string): string {
            return k
                .replace(/[\r\n]+/g, ' ')
                .replace(/[_.]+/g, ' ')   // father_email / father.email → father email
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        records.forEach((row, index) => {
            const nameResult = getValueByKeywords(row, nameAliases);
            const emailResult = getValueByKeywords(row, emailAliases, true);
            const idResult = getValueByKeywords(row, idAliases);

            const name = nameResult?.value;
            let email = emailResult?.value;
            let emailSource: 'student' | 'father' | 'mother' | 'guardian' = 'student';

            // Build cleaned metadata first so we can run the alias resolver and
            // use any parent_email as a student-email fallback when needed.
            const metadata: any = {};
            Object.entries(row).forEach(([k, v]) => {
                const normalizedKey = k.replace(/[\r\n]+/g, ' ').trim();
                metadata[normalizedKey] = typeof v === 'string' ? v.trim() : v;
            });

            // Resolve canonical parent-contact keys via regex on a normalized
            // version of each header. Preserves the original header in metadata
            // and adds canonical aliases alongside.
            for (const k of Object.keys(metadata)) {
                if (!metadata[k]) continue;
                const norm = normalizeHeader(k);
                for (const { canonical, pattern } of aliasPatterns) {
                    if (metadata[canonical]) continue; // first match wins per canonical
                    if (pattern.test(norm)) {
                        metadata[canonical] = String(metadata[k]).trim();
                        break;
                    }
                }
            }

            // Fallback: if the student's own email column wasn't found, try
            // father / mother / guardian email so the row still imports.
            // Records the chosen source in metadata.email_source for auditing.
            if (!email || !email.includes('@')) {
                const fallback = (metadata.father_email && String(metadata.father_email).includes('@'))   ? { v: metadata.father_email, s: 'father' as const }
                              : (metadata.mother_email && String(metadata.mother_email).includes('@'))   ? { v: metadata.mother_email, s: 'mother' as const }
                              : (metadata.guardian_email && String(metadata.guardian_email).includes('@')) ? { v: metadata.guardian_email, s: 'guardian' as const }
                              : null;
                if (fallback) {
                    email = String(fallback.v).trim();
                    emailSource = fallback.s;
                }
            }

            if (!name || !email) {
                skippedRows.push(row);
                return;
            }

            metadata.email_source = emailSource;
            const externalId = idResult?.value || email;

            students.push({
                university_id: universityId,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                external_id: String(externalId).trim(),
                created_by: locals.user.id,
                metadata,
                sort_order: index // Preserve original file order
            });
        });

        if (students.length > 0) {
            await createStudentsBulk(students);
        }

        return json({
            count: students.length,
            skipped: skippedRows.length,
            message: skippedRows.length > 0 ? `Imported ${students.length} students. Skipped ${skippedRows.length} rows.` : undefined
        });
    } catch (err: any) {
        console.error('File Import Error:', err);
        throw error(400, 'Failed to parse file: ' + err.message);
    }
};
