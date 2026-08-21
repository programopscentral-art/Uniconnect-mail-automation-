import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Generic petty-cash file upload (approval evidence, disbursement proof, bills).
// Returns a public URL served by /api/uploads/[...path].
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) throw error(400, 'No file uploaded');
    if (file.size > 10 * 1024 * 1024) throw error(400, 'File exceeds 10MB limit');

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || '';
    const fileName = `${crypto.randomUUID()}${ext}`;
    const uploadDir = path.resolve('static/uploads/petty-cash');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);

    return json({ url: `/api/uploads/petty-cash/${fileName}`, file_name: file.name, file_type: file.type || ext.slice(1) });
};
