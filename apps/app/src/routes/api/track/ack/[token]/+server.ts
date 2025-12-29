import { markRecipientAck } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params }) => {
    const { token } = params;
    if (!token) return json({ error: 'Missing token' }, { status: 400 });

    try {
        const res = await markRecipientAck(token);
        if (res) {
            return json({ success: true });
        } else {
            // Already acked or invalid
            return json({ success: false, message: 'Invalid or already acknowledged' });
        }
    } catch (e) {
        console.error(e);
        return json({ error: 'Internal Error' }, { status: 500 });
    }
};
