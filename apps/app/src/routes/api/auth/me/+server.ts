import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ user: null });
    }
    return json({ user: locals.user });
};
