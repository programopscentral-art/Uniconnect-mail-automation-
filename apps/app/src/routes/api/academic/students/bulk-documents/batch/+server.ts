import { db, StudentDocumentService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Accept up to 50MB per batch (a few files per student) */
export const config = { body: { maxSize: '50mb' } };

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

/**
 * Batch upload endpoint — receives one student's documents at a time.
 * The frontend extracts the ZIP client-side and sends batches here.
 *
 * Body: { university_id, niat_id, files: [{ name, content (base64) }] }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user.role as string)) {
        throw error(403, 'Only ADMIN or PROGRAM_OPS can bulk upload documents');
    }

    const { university_id, niat_id, files } = await request.json();

    if (!university_id || !niat_id || !files?.length) {
        throw error(400, 'university_id, niat_id, and files are required');
    }

    // Load valid document type codes
    const typesRes = await db.query('SELECT code FROM student_document_types');
    const validTypeCodes = new Set(typesRes.rows.map((r: any) => r.code));

    // Find student profile
    const studentRes = await db.query(
        'SELECT id FROM student_profiles WHERE university_id = $1 AND UPPER(enrollment_number) = $2 AND is_active = true',
        [university_id, niat_id.toUpperCase()]
    );

    if (studentRes.rows.length === 0) {
        return json({
            niat_id,
            uploaded: 0, skipped: 0, failed: files.length,
            errors: [{ file: '*', reason: 'Student NIAT ID not found' }]
        });
    }

    const profileId = studentRes.rows[0].id;
    const result = { niat_id, uploaded: 0, skipped: 0, failed: 0, errors: [] as any[] };

    for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const typeCode = file.name.replace(/(\.(pdf|jpg|jpeg|png|webp))+$/i, '').toUpperCase().replace(/[\s-]+/g, '_');

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            result.errors.push({ file: file.name, reason: `Invalid file type .${ext}` });
            result.failed++;
            continue;
        }

        if (!validTypeCodes.has(typeCode)) {
            result.errors.push({ file: file.name, reason: `Unknown document type "${typeCode}"` });
            result.failed++;
            continue;
        }

        try {
            const contentBuffer = Buffer.from(file.content, 'base64');

            if (contentBuffer.byteLength > MAX_FILE_SIZE) {
                result.errors.push({ file: file.name, reason: 'File exceeds 10MB limit' });
                result.failed++;
                continue;
            }

            // Check if already exists
            const existing = await db.query(
                `SELECT id FROM documents WHERE owner_entity_type = 'STUDENT' AND owner_entity_id = $1 AND document_type = $2 AND file_status = 'ACTIVE'`,
                [profileId, typeCode]
            );

            if (existing.rows.length > 0) {
                result.skipped++;
                continue;
            }

            await StudentDocumentService.uploadDocument({
                universityId: university_id,
                studentProfileId: profileId,
                documentType: typeCode,
                fileName: file.name,
                fileContent: file.content,
                fileSizeBytes: contentBuffer.byteLength,
                fileUrl: 'encrypted://db',
                uploadedBy: locals.user!.id,
                ipAddress: request.headers.get('x-forwarded-for') || undefined,
                userAgent: 'BULK_DOCUMENT_UPLOAD'
            });

            result.uploaded++;
        } catch (e: any) {
            result.errors.push({ file: file.name, reason: e.message || 'Upload failed' });
            result.failed++;
        }
    }

    return json(result);
};
