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
            const excludeKeywords = ['father', 'mother', 'parent', 'guardian', 'secondary', 'witness'];

            for (const keyword of keywords) {
                const foundKey = keys.find(k => {
                    const lowKey = k.toLowerCase().trim();
                    const lowKeyword = keyword.toLowerCase().trim();

                    // Basic match
                    const matches = lowKey === lowKeyword || lowKey.includes(lowKeyword);

                    // If searching for student email, avoid keys that mention parents
                    if (matches && isStudentEmail) {
                        const hasExclude = excludeKeywords.some(ex => lowKey.includes(ex));
                        if (hasExclude) return false;
                        // Avoid generic "Email ID" if "Student Personal Mail ID" is also an option somewhere
                        // Actually, our prioritised list already handles this by putting specific ones first.
                    }

                    return matches;
                });

                if (foundKey && row[foundKey] && String(row[foundKey]).trim() !== '') {
                    return { key: foundKey, value: String(row[foundKey]).trim() };
                }
            }
            return null;
        };

        const nameAliases = ['student full name', 'student name', 'full name', 'candidate name', 'name', 'fname'];
        const emailAliases = ['student personal mail id', 'personal mail id', 'student email', 'candidate email', 'email address', 'email id', 'email'];
        const idAliases = ['niat id', 'admnno', 'roll no', 'student id', 'external id', 'id', 'uid'];

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
            const metadata: any = {};
            Object.entries(row).forEach(([k, v]) => {
                metadata[k.trim()] = typeof v === 'string' ? v.trim() : v;
            });

            // Note: We used to delete matched keys from metadata here. 
            // We'll keep them now so users see their "Correct Headers" in the table too.
            // ['Name', 'name', 'Email', 'email', 'ExternalID', 'external_id'].forEach(k => delete metadata[k]);

            students.push({
                university_id: universityId,
                name: name,
                email: email.toLowerCase(),
                external_id: externalId,
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
