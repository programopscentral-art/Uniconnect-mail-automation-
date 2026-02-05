import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FigmaService } from '$lib/server/services/figma-service';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { fileKey, nodeId, token } = await request.json();

    if (!fileKey || !nodeId || !token) {
        return json({ success: false, message: 'FileKey, NodeID, and Token are required' }, { status: 400 });
    }

    try {
        console.log(`[FIGMA_FRAMES] 🔍 Fetching frames for page: ${nodeId}`);
        const frames = await FigmaService.getNodeFrames(fileKey, token, nodeId);

        return json({
            success: true,
            frames
        });
    } catch (err: any) {
        console.error(`[FIGMA_FRAMES] ❌ Failed:`, err.message);
        return json({ success: false, message: err.message }, { status: 500 });
    }
};
