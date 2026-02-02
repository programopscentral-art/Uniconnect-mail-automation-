import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
    const baseUrl = env.EXTRACTOR_BASE_URL;
    if (!baseUrl) {
        console.error('[PROXY_EXTRACT] ❌ EXTRACTOR_BASE_URL is not defined');
        throw error(500, 'Extraction engine not configured');
    }

    try {
        const formData = await request.formData();
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/extract-template`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[PROXY_EXTRACT] ❌ Engine error (${res.status}):`, errBody);
            throw error(res.status as any, 'Extraction engine failed');
        }

        const data = await res.json();
        return json(data);
    } catch (err: any) {
        console.error('[PROXY_EXTRACT] ❌ Proxy error:', err.message);
        throw error(500, err.message || 'Failed to proxy extraction request');
    }
};
