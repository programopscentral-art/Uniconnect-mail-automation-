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

        records.forEach((row, index) => {
            const nameResult = getValueByKeywords(row, nameAliases);
            const emailResult = getValueByKeywords(row, emailAliases, true);
            const idResult = getValueByKeywords(row, idAliases);

            const name = nameResult?.value;
            const email = emailResult?.value;
            const externalId = idResult?.value || email;

            if (!name || !email) {
                skippedRows.push(row);
                return;
            }

            // Create cleaned metadata by trimming all keys and values
            // CRITICAL FIX: Replace newlines in keys with spaces to match template placeholders
            const metadata: any = {};
            Object.entries(row).forEach(([k, v]) => {
                const normalizedKey = k.replace(/[\r\n]+/g, ' ').trim(); // Replace newlines with space, then trim
                metadata[normalizedKey] = typeof v === 'string' ? v.trim() : v;
            });

            // Note: We used to delete matched keys from metadata here. 
            // We'll keep them now so users see their "Correct Headers" in the table too.
            // ['Name', 'name', 'Email', 'email', 'ExternalID', 'external_id'].forEach(k => delete metadata[k]);

            students.push({
                university_id: universityId,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                external_id: String(externalId).trim(),
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
