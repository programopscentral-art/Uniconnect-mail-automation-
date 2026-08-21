import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

// Petty-cash file upload (approval evidence, disbursement proof, bills).
// Stored in the DB so it survives redeploys and is viewable from any instance;
// served back inline by /api/petty-cash/file/[id].
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) throw error(400, 'No file uploaded');
    if (file.size > 10 * 1024 * 1024) throw error(400, 'File exceeds 10MB limit');

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const fileType = file.type || (ext ? `application/${ext}` : 'application/octet-stream');

    const { rows } = await db.query(
        `INSERT INTO petty_cash_files (file_name, file_type, content_base64, uploaded_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [file.name, fileType, base64, locals.user.id],
    );

    return json({ url: `/api/petty-cash/file/${rows[0].id}`, file_name: file.name, file_type: fileType });
};
