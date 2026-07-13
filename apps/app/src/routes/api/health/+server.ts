import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    return json({ ok: true, build: 'svelte-check-4.5.0-lockfix', timestamp: new Date().toISOString() });
};
