import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FigmaService } from '$lib/server/services/figma-service';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { url, token } = await request.json();

    if (!url || !token) {
        return json({ success: false, message: 'URL and Token are required' }, { status: 400 });
    }

    try {
        console.log(`[FIGMA_VERIFY] 🔍 Verifying: ${url}`);
        const fileKey = FigmaService.extractFileKey(url);
        const meta = await FigmaService.getFileMeta(fileKey, token);

        return json({
            success: true,
            fileKey,
            fileName: meta.name,
            pages: meta.pages
        });
    } catch (err: any) {
        console.error(`[FIGMA_VERIFY] ❌ Failed:`, err.message);

        // Map Figma/Fetch errors to user-friendly messages
        let message = err.message;
        let status = 500;

        if (message.includes('401')) {
            message = 'Invalid Figma Access Token (401)';
            status = 401;
        } else if (message.includes('404')) {
            message = 'Figma File not found (404). Check the URL and permissions.';
            status = 404;
        } else if (message.includes('403')) {
            message = 'Access Denied (403). Ensure the token has "File Read" permissions.';
            status = 403;
        } else if (message.includes('429')) {
            message = 'Figma API Rate Limit exceeded (429). Please wait a moment.';
            status = 429;
        }

        return json({ success: false, message }, { status });
    }
};
