import { error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

// Serve a budget-proposal attachment from its DB-stored base64 (file_content),
// so files survive redeploys and open inline instead of relying on ephemeral disk.
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const { rows } = await db.query(
        `SELECT file_name, file_type, file_content FROM budget_proposal_attachments WHERE id = $1`,
        [params.attId],
    );
    if (rows.length === 0 || !rows[0].file_content) throw error(404, 'File not found');
    const f = rows[0];
    const buf = Buffer.from(f.file_content, 'base64');

    const name = String(f.file_name || '').toLowerCase();
    let ct = f.file_type || 'application/octet-stream';
    if (name.endsWith('.pdf')) ct = 'application/pdf';
    else if (name.endsWith('.png')) ct = 'image/png';
    else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) ct = 'image/jpeg';
    else if (name.endsWith('.webp')) ct = 'image/webp';
    else if (name.endsWith('.gif')) ct = 'image/gif';

    return new Response(buf, {
        headers: {
            'Content-Type': ct,
            'Content-Length': String(buf.length),
            'Content-Disposition': `inline; filename="${String(f.file_name || 'file').replace(/"/g, '')}"`,
            'Cache-Control': 'private, max-age=3600',
        },
    });
};
