import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
    const baseUrl = env.EXTRACTOR_BASE_URL;
    if (!baseUrl) {
        console.error('[PROXY_HEALTH] ❌ EXTRACTOR_BASE_URL is not defined');
        return json({ ok: false, error: 'Configuration missing' }, { status: 500 });
    }

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`);
        const data = await res.json();
        return json(data);
    } catch (err: any) {
        console.error('[PROXY_HEALTH] ❌ Error:', err.message);
        return json({ ok: false, error: err.message }, { status: 502 });
    }
};
