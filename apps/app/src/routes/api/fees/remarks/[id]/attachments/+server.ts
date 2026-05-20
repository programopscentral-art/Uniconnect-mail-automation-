import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addFeeRemarkAttachment } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per proof
const ALLOWED_MIME = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

export const POST: RequestHandler = async ({ params, request, locals }) => {
    checkFeeAccess(locals, 'edit_remarks');
    if (!params.id) throw error(400, 'remark id required');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) throw error(400, 'No file uploaded');
    if (file.size > MAX_FILE_SIZE) throw error(400, 'File exceeds 5 MB limit');
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
        throw error(400, `Unsupported file type: ${file.type}`);
    }

    const buffer = await file.arrayBuffer();
    const ext = path.extname(file.name) || '';
    const safeName = `${params.id}_${crypto.randomUUID()}${ext}`;
    const uploadDir = path.resolve('static/uploads/fee-proofs');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    const publicUrl = `/uploads/fee-proofs/${safeName}`;

    const attachment = await addFeeRemarkAttachment({
        remark_id: params.id,
        file_name: file.name,
        file_url: publicUrl,
        storage_path: filePath,
        size_bytes: file.size,
        mime_type: file.type || undefined,
        uploaded_by: locals.user!.id
    });

    return json(attachment);
};
