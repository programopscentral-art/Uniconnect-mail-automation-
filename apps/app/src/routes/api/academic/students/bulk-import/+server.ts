import * as XLSX from 'xlsx';
import { db, StudentService, StudentDocumentService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';

function str(v: any): string { return String(v ?? '').trim(); }

/**
 * Comprehensive student bulk import with all fields + optional documents.
 *
 * Excel Format (per sheet = one program code):
 * ┌────────────────┬──────────────┬───────────────────┬────────────┬─────────┬────────┬─────────────┬─────────────┬──────────────┬──────────────────┬────────────────┐
 * │ Student Name   │ NIAT ID      │ Email             │ Phone      │ Gender  │ DOB    │ Blood Group │ Father Name │ Mother Name  │ Father Phone     │ Mother Phone   │
 * ├────────────────┼──────────────┼───────────────────┼────────────┼─────────┼────────┼─────────────┼─────────────┼──────────────┼──────────────────┼────────────────┤
 * │ John Doe       │ N25H02A0001  │ john@gmail.com    │ 9876543210 │ Male    │ 2005.. │ A+          │ James Doe   │ Jane Doe     │ 9876543211       │ 9876543212     │
 * └────────────────┴──────────────┴───────────────────┴────────────┴─────────┴────────┴─────────────┴─────────────┴──────────────┴──────────────────┴────────────────┘
 *
 * Additional optional columns: Emergency Contact, Aadhaar, Roll Number, Admission Date, Address
 *
 * Documents (optional):
 * - Upload a ZIP file where folders are named by NIAT ID
 * - Inside each folder, files named as document type code:
 *   N25H02A0001/CERTIFICATE_10TH.pdf
 *   N25H02A0001/MARKSHEET_10TH.jpg
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string)) {
        throw error(403, 'Only ADMIN or PROGRAM_OPS can bulk import');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const universityId = formData.get('university_id') as string;
    const termName = (formData.get('term_name') as string)?.trim();
    const batchId = (formData.get('batch_id') as string)?.trim() || undefined;

    if (!file) throw error(400, 'No Excel file uploaded');
    if (!universityId) throw error(400, 'university_id is required');
    if (!termName) throw error(400, 'term_name is required');

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    // Load all lookups
    const [allPrograms, allTermsRes, allSectionsRes] = await Promise.all([
        db.query('SELECT id, code, name FROM programs WHERE university_id = $1 AND is_active = true', [universityId]),
        db.query(
            `SELECT t.id, t.name, t.program_id FROM terms t
             JOIN programs p ON p.id = t.program_id
             WHERE p.university_id = $1 AND t.is_active = true`,
            [universityId]
        ),
        db.query(
            `SELECT s.id, s.term_id FROM sections s
             JOIN terms t ON t.id = s.term_id
             JOIN programs p ON p.id = t.program_id
             WHERE p.university_id = $1 AND s.is_active = true
             ORDER BY s.name ASC`,
            [universityId]
        )
    ]);

    const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawCodeToProgram = new Map<string, { id: string; code: string }>();
    for (const p of allPrograms.rows) {
        rawCodeToProgram.set(p.code.toUpperCase(), p);
        rawCodeToProgram.set(normalize(p.code), p);
    }
    const programToTermId = new Map<string, string>();
    for (const t of allTermsRes.rows) {
        if (t.name.toLowerCase() === termName.toLowerCase()) programToTermId.set(t.program_id, t.id);
    }
    const termToSectionId = new Map<string, string>();
    for (const s of allSectionsRes.rows) {
        if (!termToSectionId.has(s.term_id)) termToSectionId.set(s.term_id, s.id);
    }

    // Column header mappings (flexible)
    const HEADER_MAP: Record<string, string[]> = {
        name: ['student name', 'name', 'full name'],
        enrollment_number: ['niat id', 'enrollment', 'student id', 'enrollment number', 'enrollment no', 'niat_id'],
        email: ['email', 'mail', 'email id', 'email address'],
        phone: ['phone', 'mobile', 'phone number', 'contact'],
        gender: ['gender', 'sex'],
        date_of_birth: ['dob', 'date of birth', 'birth date', 'birthdate'],
        blood_group: ['blood group', 'blood type', 'bloodgroup'],
        father_name: ['father name', 'father', 'father\'s name'],
        mother_name: ['mother name', 'mother', 'mother\'s name'],
        father_phone: ['father phone', 'father mobile', 'father contact'],
        mother_phone: ['mother phone', 'mother mobile', 'mother contact'],
        emergency_contact: ['emergency contact', 'emergency', 'emergency phone'],
        aadhaar: ['aadhaar', 'aadhar', 'aadhaar number', 'aadhar number'],
        roll_number: ['roll number', 'roll no', 'roll'],
        admission_date: ['admission date', 'date of admission'],
        address: ['address', 'permanent address', 'home address'],
    };

    const result = {
        sheets_processed: 0,
        students_created: 0,
        students_failed: 0,
        pii_stored: 0,
        profiles_updated: 0,
        errors: [] as { sheet: string; row?: number; reason: string }[]
    };

    for (const sheetName of wb.SheetNames) {
        const rawCode = sheetName.trim().toUpperCase();
        const prog = rawCodeToProgram.get(rawCode) ?? rawCodeToProgram.get(normalize(rawCode));
        if (!prog) {
            result.errors.push({ sheet: sheetName, reason: `Program code "${rawCode}" not found` });
            continue;
        }
        const termId = programToTermId.get(prog.id);
        if (!termId) {
            result.errors.push({ sheet: sheetName, reason: `Term "${termName}" not found for "${rawCode}"` });
            continue;
        }
        const sectionId = termToSectionId.get(termId);
        if (!sectionId) {
            result.errors.push({ sheet: sheetName, reason: `No section under "${termName}" for "${rawCode}"` });
            continue;
        }

        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
        if (aoa.length < 2) continue;

        // Map headers to field names
        const headers = (aoa[0] as any[]).map((h: any) => str(h).toLowerCase());
        const colMap: Record<string, number> = {};
        for (const [field, aliases] of Object.entries(HEADER_MAP)) {
            const idx = headers.findIndex(h => aliases.some(a => h.includes(a)));
            if (idx !== -1) colMap[field] = idx;
        }

        if (colMap.name === undefined || colMap.enrollment_number === undefined) {
            result.errors.push({ sheet: sheetName, reason: 'Must have "Student Name" and "NIAT ID" columns' });
            continue;
        }

        // Parse all rows
        const students: any[] = [];
        const extendedData: Map<string, Record<string, any>> = new Map();

        for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
            const row = aoa[rowIdx] as any[];
            if (!row.some((cell: any) => str(cell) !== '')) continue;

            const name = str(row[colMap.name]);
            const enrollmentNumber = str(row[colMap.enrollment_number]);
            if (!name || !enrollmentNumber) {
                result.errors.push({ sheet: sheetName, row: rowIdx + 1, reason: 'Missing name or NIAT ID' });
                result.students_failed++;
                continue;
            }

            const student: any = { name, enrollment_number: enrollmentNumber };
            const extra: Record<string, any> = {};

            // Extract all optional fields
            for (const [field, idx] of Object.entries(colMap)) {
                if (field === 'name' || field === 'enrollment_number') continue;
                const val = str(row[idx]);
                if (!val) continue;

                if (['phone', 'father_phone', 'mother_phone', 'emergency_contact', 'aadhaar'].includes(field)) {
                    // PII fields — store separately for encryption
                    extra[field] = val;
                } else if (field === 'email') {
                    student.email = val;
                    extra.email = val;
                } else if (field === 'date_of_birth') {
                    // Handle Excel date serial numbers or date strings
                    if (typeof row[idx] === 'number') {
                        const d = XLSX.SSF.parse_date_code(row[idx]);
                        extra.date_of_birth = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
                    } else {
                        extra.date_of_birth = val;
                    }
                } else if (field === 'admission_date') {
                    if (typeof row[idx] === 'number') {
                        const d = XLSX.SSF.parse_date_code(row[idx]);
                        extra.admission_date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
                    } else {
                        extra.admission_date = val;
                    }
                } else {
                    extra[field] = val;
                }
            }

            students.push(student);
            extendedData.set(enrollmentNumber, extra);
        }

        if (students.length === 0) continue;

        // Step 1: Import base student profiles (creates users, assigns roles)
        const importResult = await StudentService.importStudents(
            universityId, prog.id, termId, sectionId, students, batchId
        );
        result.students_created += importResult.success;
        result.students_failed += importResult.failed;
        for (const e of importResult.errors) result.errors.push({ sheet: sheetName, reason: e });

        // Step 2: Update extended profile fields and encrypt PII for each student
        for (const [enrollNum, extra] of extendedData.entries()) {
            try {
                // Get the student profile ID
                const spRes = await db.query(
                    'SELECT id FROM student_profiles WHERE university_id = $1 AND enrollment_number = $2',
                    [universityId, enrollNum]
                );
                const profileId = spRes.rows[0]?.id;
                if (!profileId) continue;

                // Update plain fields on student_profiles
                const plainFields: Record<string, any> = {};
                for (const f of ['father_name', 'mother_name', 'date_of_birth', 'gender', 'blood_group', 'roll_number', 'admission_date', 'address']) {
                    if (extra[f]) plainFields[f] = extra[f];
                }
                if (Object.keys(plainFields).length > 0) {
                    await StudentService.updateProfile(profileId, plainFields as any);
                    result.profiles_updated++;
                }

                // Encrypt and store PII fields
                const piiFields: Record<string, string> = {};
                for (const f of ['phone', 'email', 'aadhaar', 'father_phone', 'mother_phone', 'emergency_contact']) {
                    if (extra[f]) piiFields[f] = extra[f];
                }
                // Also store niat_id as PII
                piiFields.niat_id = enrollNum;

                if (Object.keys(piiFields).length > 0) {
                    const { StudentPIIService } = await import('@uniconnect/shared');
                    await StudentPIIService.encryptAndStorePII(profileId, piiFields as any, locals.user!.id);
                    result.pii_stored++;
                }
            } catch (e: any) {
                result.errors.push({ sheet: sheetName, reason: `PII/profile update failed for ${enrollNum}: ${e.message}` });
            }
        }

        result.sheets_processed++;
    }

    return json({
        success: result.students_failed === 0 && result.errors.length === 0,
        summary: `${result.sheets_processed} programs — ${result.students_created} students imported, ${result.profiles_updated} profiles updated, ${result.pii_stored} PII records encrypted`,
        ...result
    });
};

/**
 * GET: Download template Excel file
 */
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const wb = XLSX.utils.book_new();

    // Create template sheet with all column headers
    const headers = [
        'Student Name', 'NIAT ID', 'Email', 'Phone', 'Gender', 'Date of Birth',
        'Blood Group', 'Father Name', 'Mother Name', 'Father Phone', 'Mother Phone',
        'Emergency Contact', 'Aadhaar', 'Roll Number', 'Admission Date', 'Address'
    ];

    const sampleRow = [
        'Pathan Abdul Gouse', 'N25H02A0004', 'pathangouse777@gmail.com', '9876543210',
        'Male', '2005-06-15', 'A+', 'Abdul Khan', 'Fatima Begum', '9876543211',
        '9876543212', '9876543213', '123456789012', 'R001', '2026-03-10',
        'Hyderabad, Telangana'
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);

    // Set column widths
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 18) }));

    XLSX.utils.book_append_sheet(wb, ws, 'BTAI');

    // Add instruction sheet
    const instrWs = XLSX.utils.aoa_to_sheet([
        ['UniConnect Student Bulk Import Template'],
        [''],
        ['Instructions:'],
        ['1. Each sheet tab = one program code (e.g., BTAI, BTECH, MCA)'],
        ['2. Required columns: "Student Name" and "NIAT ID"'],
        ['3. All other columns are optional but recommended'],
        ['4. Phone numbers, Aadhaar, and parent contacts are encrypted with AES-256-GCM'],
        ['5. Dates can be in YYYY-MM-DD format or Excel date format'],
        ['6. Gender: Male / Female / Other'],
        ['7. Blood Group: A+, A-, B+, B-, AB+, AB-, O+, O-'],
        [''],
        ['Column Reference:'],
        ['Student Name    — Full name of the student (REQUIRED)'],
        ['NIAT ID         — Unique enrollment/NIAT identifier (REQUIRED)'],
        ['Email           — Student email address'],
        ['Phone           — Student phone number (encrypted)'],
        ['Gender          — Male / Female / Other'],
        ['Date of Birth   — YYYY-MM-DD'],
        ['Blood Group     — A+, A-, B+, B-, AB+, AB-, O+, O-'],
        ['Father Name     — Father full name'],
        ['Mother Name     — Mother full name'],
        ['Father Phone    — Father phone number (encrypted)'],
        ['Mother Phone    — Mother phone number (encrypted)'],
        ['Emergency Contact — Emergency contact number (encrypted)'],
        ['Aadhaar         — 12-digit Aadhaar number (encrypted)'],
        ['Roll Number     — University roll number'],
        ['Admission Date  — Date of admission (YYYY-MM-DD)'],
        ['Address         — Full postal address'],
        [''],
        ['Document Upload:'],
        ['After importing students, upload documents individually per student'],
        ['from the student profile page. Documents are encrypted with AES-256-GCM'],
        ['and integrity-verified with SHA-256 hashing.'],
        [''],
        ['Security:'],
        ['- All PII fields (phone, aadhaar, parent contacts) are individually encrypted'],
        ['- Documents are encrypted at rest with AES-256-GCM'],
        ['- Every access is logged with IP and user agent'],
        ['- Role-based access control limits who can view sensitive data'],
    ]);
    instrWs['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    return new Response(buf, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="student-import-template.xlsx"'
        }
    });
};
