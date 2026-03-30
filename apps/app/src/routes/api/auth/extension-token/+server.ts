import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession } from '@uniconnect/shared';

// Generate a new session token for the Chrome extension
// User must be logged in (session cookie) to generate this
export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'You must be logged in to generate an extension token');
    }

    try {
        // Create a new session token for this user
        const token = await createSession(locals.user.id);

        return json({
            token,
            message: 'Extension token generated. Paste this into the Chrome extension settings.',
            expiresIn: '7 days'
        });
    } catch (e: any) {
        console.error('[EXTENSION_TOKEN] Error:', e);
        throw error(500, 'Failed to generate token');
    }
};
