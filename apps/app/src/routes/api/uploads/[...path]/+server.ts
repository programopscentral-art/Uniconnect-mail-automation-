import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';

export const GET: RequestHandler = async ({ params }) => {
    try {
        const filePath = path.resolve('static/uploads', params.path);

        if (!fs.existsSync(filePath)) {
            throw error(404, 'File not found');
        }

        const stats = fs.statSync(filePath);
        const fileStream = fs.createReadStream(filePath);

        let contentType = 'application/octet-stream';
        const ext = path.extname(filePath).toLowerCase();
        if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.pdf') contentType = 'application/pdf';

        return new Response(fileStream as any, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': stats.size.toString(),
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e: any) {
        console.error('[API_UPLOADS] Error serving file:', e);
        throw error(e.status || 500, 'Internal Server Error');
    }
};
