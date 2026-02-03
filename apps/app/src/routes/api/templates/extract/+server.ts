import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LayoutExtractor } from '$lib/server/services/layout-extractor';

const extractor = new LayoutExtractor();

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            throw error(400, 'Missing file field');
        }

        console.log(`[API_EXTRACT] 📥 Processing file: ${file.name} (${file.type})`);

        // Check if PDF and throw clear error if not supported yet
        if (file.type === 'application/pdf') {
            return json({
                success: false,
                message: 'PDF rasterization is currently being optimized. Please upload an image (JPG/PNG) for now.'
            }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const blueprint = await extractor.extract(buffer, file.type);

        console.log(`[API_EXTRACT] ✅ Successfully extracted ${blueprint.elements.length} elements`);

        return json({
            success: true,
            template: {
                name: file.name.split('.')[0],
                layout_schema: blueprint
            }
        });
    } catch (err: any) {
        console.error('[API_EXTRACT] ❌ Extraction Failed:', err.message);
        return json({
            success: false,
            message: err.message || 'Internal Extraction Error'
        }, { status: 500 });
    }
};
