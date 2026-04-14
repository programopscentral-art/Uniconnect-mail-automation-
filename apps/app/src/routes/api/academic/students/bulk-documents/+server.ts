import JSZip from 'jszip';
import { db, StudentDocumentService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Allow up to 3GB uploads for bulk documents */
export const config = { body: { maxSize: '3gb' } };

/**
 * Bulk Document Upload via ZIP
 *
 * ZIP structure:
 *   N25H02A0004/
 *     CERTIFICATE_10TH.pdf
 *     MARKSHEET_10TH.jpg
 *     ID_PROOF_AADHAAR.pdf
 *   N25H02A0006/
 *     CERTIFICATE_10TH.pdf
 *     PASSPORT_PHOTO.jpg
 *
 * Folder name = NIAT ID (enrollment_number)
 * File name (without extension) = document type code
 * Allowed extensions: .pdf, .jpg, .jpeg, .png, .webp
 */

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_ZIP_SIZE = 3 * 1024 * 1024 * 1024; // 3GB total ZIP

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string)) {
        throw error(403, 'Only ADMIN or PROGRAM_OPS can bulk upload documents');
    }

    const formData = await request.formData();
    const zipFile = formData.get('file') as File | null;
    const universityId = formData.get('university_id') as string;

    if (!zipFile) throw error(400, 'No ZIP file uploaded');
    if (!universityId) throw error(400, 'university_id is required');
    if (zipFile.size > MAX_ZIP_SIZE) throw error(400, 'ZIP file exceeds 3GB limit');

    // Load valid document type codes
    const typesRes = await db.query('SELECT code FROM student_document_types');
    const validTypeCodes = new Set(typesRes.rows.map((r: any) => r.code));

    // Load student NIAT ID → profile ID mapping for this university
    const studentsRes = await db.query(
        'SELECT id, enrollment_number FROM student_profiles WHERE university_id = $1 AND is_active = true',
        [universityId]
    );
    const niatToProfileId = new Map<string, string>();
    for (const s of studentsRes.rows) {
        if (s.enrollment_number) {
            niatToProfileId.set(s.enrollment_number.toUpperCase(), s.id);
        }
    }

    // Extract ZIP
    const arrayBuffer = await zipFile.arrayBuffer();
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(arrayBuffer);
    } catch {
        throw error(400, 'Invalid ZIP file — could not extract');
    }

    const result = {
        documents_uploaded: 0,
        documents_skipped: 0,
        documents_failed: 0,
        students_matched: 0,
        students_not_found: [] as string[],
        errors: [] as { niatId: string; file: string; reason: string }[],
        details: [] as { niatId: string; file: string; type: string; status: string }[]
    };

    // Group files by folder (NIAT ID)
    const filesByNiat = new Map<string, { name: string; path: string; zipEntry: JSZip.JSZipObject }[]>();

    zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;

        // Parse: NIAT_ID/DOCUMENT_TYPE.ext or NIAT_ID/anything.ext
        const parts = relativePath.split('/');
        if (parts.length < 2) return; // Skip files at root level

        // Handle nested __MACOSX or hidden files
        if (parts.some(p => p.startsWith('.') || p.startsWith('__'))) return;

        const folderName = parts[parts.length - 2].trim().toUpperCase();
        // Handle folders like "N25H02A0183 - Nunna Jaswanthi" — extract just the NIAT ID
        const niatId = folderName.split(/\s*[-–—]\s*/)[0].trim();
        const fileName = parts[parts.length - 1];

        if (!niatId || !fileName) return;

        if (!filesByNiat.has(niatId)) filesByNiat.set(niatId, []);
        filesByNiat.get(niatId)!.push({ name: fileName, path: relativePath, zipEntry });
    });

    const matchedStudents = new Set<string>();

    for (const [niatId, files] of filesByNiat) {
        const profileId = niatToProfileId.get(niatId);
        if (!profileId) {
            result.students_not_found.push(niatId);
            for (const f of files) {
                result.errors.push({ niatId, file: f.name, reason: 'Student NIAT ID not found' });
                result.documents_failed++;
            }
            continue;
        }

        matchedStudents.add(niatId);

        for (const file of files) {
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            // Strip ALL extensions (handles double extensions like CERTIFICATE_10TH.jpg.jpg)
            const typeCode = file.name.replace(/(\.(pdf|jpg|jpeg|png|webp))+$/i, '').toUpperCase().replace(/[\s-]+/g, '_');

            // Validate extension
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                result.errors.push({ niatId, file: file.name, reason: `Invalid file type .${ext} — allowed: PDF, JPG, PNG, WebP` });
                result.details.push({ niatId, file: file.name, type: typeCode, status: 'INVALID_TYPE' });
                result.documents_failed++;
                continue;
            }

            // Validate document type code
            if (!validTypeCodes.has(typeCode)) {
                result.errors.push({ niatId, file: file.name, reason: `Unknown document type "${typeCode}". Use codes like CERTIFICATE_10TH, MARKSHEET_12TH, etc.` });
                result.details.push({ niatId, file: file.name, type: typeCode, status: 'UNKNOWN_TYPE' });
                result.documents_failed++;
                continue;
            }

            try {
                // Extract file content
                const content = await file.zipEntry.async('arraybuffer');

                // Validate file size
                if (content.byteLength > MAX_FILE_SIZE) {
                    result.errors.push({ niatId, file: file.name, reason: 'File exceeds 10MB limit' });
                    result.details.push({ niatId, file: file.name, type: typeCode, status: 'TOO_LARGE' });
                    result.documents_failed++;
                    continue;
                }

                const base64Content = Buffer.from(content).toString('base64');

                // Check if this type already exists for this student
                const existing = await db.query(
                    `SELECT id FROM documents WHERE owner_entity_type = 'STUDENT' AND owner_entity_id = $1 AND document_type = $2 AND file_status = 'ACTIVE'`,
                    [profileId, typeCode]
                );

                if (existing.rows.length > 0) {
                    result.details.push({ niatId, file: file.name, type: typeCode, status: 'ALREADY_EXISTS' });
                    result.documents_skipped++;
                    continue;
                }

                // Upload with encryption
                await StudentDocumentService.uploadDocument({
                    universityId,
                    studentProfileId: profileId,
                    documentType: typeCode,
                    fileName: file.name,
                    fileContent: base64Content,
                    fileSizeBytes: content.byteLength,
                    fileUrl: 'encrypted://db',
                    uploadedBy: locals.user!.id,
                    ipAddress: request.headers.get('x-forwarded-for') || undefined,
                    userAgent: 'BULK_DOCUMENT_UPLOAD'
                });

                result.details.push({ niatId, file: file.name, type: typeCode, status: 'UPLOADED' });
                result.documents_uploaded++;
            } catch (e: any) {
                result.errors.push({ niatId, file: file.name, reason: e.message || 'Upload failed' });
                result.details.push({ niatId, file: file.name, type: typeCode, status: 'ERROR' });
                result.documents_failed++;
            }
        }
    }

    result.students_matched = matchedStudents.size;

    return json({
        success: result.documents_failed === 0 && result.students_not_found.length === 0,
        summary: `${result.students_matched} students matched — ${result.documents_uploaded} documents encrypted & uploaded, ${result.documents_skipped} skipped (already exist), ${result.documents_failed} failed`,
        ...result
    });
};
