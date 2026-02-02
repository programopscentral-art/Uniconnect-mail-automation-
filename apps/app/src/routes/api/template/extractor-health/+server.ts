import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
    const baseUrl = env.EXTRACTOR_BASE_URL;
    if (!baseUrl) {
        return json({ ok: false, error: 'EXTRACTOR_BASE_URL is not set' }, { status: 500 });
    }

    try {
        const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, { method: 'GET' });
        const body = await resp.text();

        if (!resp.ok) {
            return json({ ok: false, status: resp.status, body }, { status: 502 });
        }

        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e: any) {
        return json({ ok: false, error: e.message || String(e) }, { status: 502 });
    }
};
