import { json, error } from '@sveltejs/kit';
import { addBudgetProposalAttachment } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) throw error(400, 'No file uploaded');

        // Validation
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) throw error(400, 'File size exceeds 10MB limit');

        const buffer = await file.arrayBuffer();
        const ext = path.extname(file.name);
        const fileName = `${params.id}_${crypto.randomUUID()}${ext}`;
        const uploadDir = path.resolve('static/uploads/budget-proposals');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        const publicUrl = `/uploads/budget-proposals/${fileName}`;

        const attachment = await addBudgetProposalAttachment({
            proposal_id: params.id,
            file_url: publicUrl,
            file_name: file.name,
            file_type: file.type || ext.slice(1).toUpperCase(),
            uploaded_by: locals.user.id
        });

        return json(attachment);
    } catch (e: any) {
        console.error('[ATTACHMENT_UPLOAD_ERROR]', e);
        throw error(e.status || 500, e.message || 'Internal Server Error');
    }
};
