import { error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

// Serve a DB-stored petty-cash file inline (so PDFs/images open in the browser
// rather than downloading).
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const { rows } = await db.query(
        `SELECT file_name, file_type, content_base64 FROM petty_cash_files WHERE id = $1`,
        [params.id],
    );
    if (rows.length === 0) throw error(404, 'File not found');
    const f = rows[0];
    const buf = Buffer.from(f.content_base64, 'base64');

    // Normalise content type for inline display.
    const name = String(f.file_name || '').toLowerCase();
    let ct = f.file_type || 'application/octet-stream';
    if (name.endsWith('.pdf')) ct = 'application/pdf';
    else if (name.endsWith('.png')) ct = 'image/png';
    else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) ct = 'image/jpeg';
    else if (name.endsWith('.webp')) ct = 'image/webp';
    else if (name.endsWith('.gif')) ct = 'image/gif';
    else if (name.endsWith('.heic')) ct = 'image/heic';

    return new Response(buf, {
        headers: {
            'Content-Type': ct,
            'Content-Length': String(buf.length),
            'Content-Disposition': `inline; filename="${f.file_name.replace(/"/g, '')}"`,
            'Cache-Control': 'private, max-age=3600',
        },
    });
};
