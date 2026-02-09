import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registerFcmToken } from '@uniconnect/shared';

export const POST: RequestHandler = async ({ request, locals }) => {
    const { user } = locals;
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, deviceInfo } = await request.json();
    if (!token) {
        return json({ error: 'Token is required' }, { status: 400 });
    }

    try {
        await registerFcmToken(user.id, token, deviceInfo);
        return json({ success: true });
    } catch (error) {
        console.error('Failed to register FCM token:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
