import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async () => {
    try {
        // Try to serve the physical file if it exists
        const filePath = path.resolve('apps/app/static/crescent-logo.png');
        const file = fs.readFileSync(filePath);
        return new Response(file, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e) {
        // Fallback to 204 No Content to at least stop the 404 logs
        return new Response(null, { status: 204 });
    }
};
