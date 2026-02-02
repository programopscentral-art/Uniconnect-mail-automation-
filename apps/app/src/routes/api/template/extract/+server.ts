import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
    const baseUrl = env.EXTRACTOR_BASE_URL;
    if (!baseUrl) {
        console.error('[PROXY_EXTRACT] ❌ EXTRACTOR_BASE_URL is not set');
        return json({ success: false, error: 'EXTRACTOR_BASE_URL is not set' }, { status: 500 });
    }

    try {
        const form = await request.formData();
        const file = form.get('file');

        if (!(file instanceof File)) {
            console.error('[PROXY_EXTRACT] ❌ Missing file field');
            return json({ success: false, error: 'Missing file field' }, { status: 400 });
        }

        // Forward file to extractor
        const forward = new FormData();
        forward.append('file', file, file.name);

        console.log(`[PROXY_EXTRACT] 🛰️ Forwarding to ${baseUrl}/api/extract-template`);
        const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/extract-template`, {
            method: 'POST',
            body: forward
        });

        const text = await resp.text(); // keep as text first to avoid JSON parse crash

        return new Response(text, {
            status: resp.status,
            headers: { 'content-type': resp.headers.get('content-type') ?? 'application/json' }
        });
    } catch (err: any) {
        console.error('[PROXY_EXTRACT] ❌ Error:', err.message);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};
