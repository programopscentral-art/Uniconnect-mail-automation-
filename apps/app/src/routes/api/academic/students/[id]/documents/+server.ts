import { json, error } from '@sveltejs/kit';
import { StudentDocumentService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'image/jpg',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const docs = await StudentDocumentService.getDocumentsForStudent(
            params.id,
            locals.user.id,
            locals.user.role as string,
            locals.user.university_id
        );
        return json(docs);
    } catch (e: any) {
        throw error(403, e.message);
    }
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const allowedRoles = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'BOA', 'COS', 'PM', 'PMA'];
    if (!allowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Insufficient permissions to upload documents');
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const documentType = formData.get('document_type') as string;
        const universityId = formData.get('university_id') as string || locals.user.university_id;

        if (!file) throw error(400, 'No file uploaded');
        if (!documentType) throw error(400, 'Document type is required');
        if (!universityId) throw error(400, 'University ID is required');

        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            throw error(400, `File type ${file.type} not allowed. Allowed: PDF, JPEG, PNG, WebP`);
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            throw error(400, 'File size exceeds 10MB limit');
        }

        const buffer = await file.arrayBuffer();
        const base64Content = Buffer.from(buffer).toString('base64');
        const ext = path.extname(file.name) || '.pdf';
        const fileName = `student_${params.id}_${crypto.randomUUID()}${ext}`;

        // Save to disk
        const uploadDir = path.resolve('static/uploads/student-documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        const publicUrl = `/api/uploads/student-documents/${fileName}`;

        const doc = await StudentDocumentService.uploadDocument({
            universityId,
            studentProfileId: params.id,
            documentType,
            fileName: file.name,
            fileContent: base64Content,
            fileSizeBytes: file.size,
            fileUrl: publicUrl,
            uploadedBy: locals.user.id,
            ipAddress: request.headers.get('x-forwarded-for') || undefined,
            userAgent: request.headers.get('user-agent') || undefined
        });

        return json(doc);
    } catch (e: any) {
        if (e.status) throw e;
        console.error('[STUDENT_DOC_UPLOAD_ERROR]', e);
        throw error(500, e.message || 'Upload failed');
    }
};
