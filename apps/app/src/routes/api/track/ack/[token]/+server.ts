import { markRecipientAck } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params }) => {
    const { token } = params;
    if (!token) return json({ error: 'Missing token' }, { status: 400 });

    try {
        const res = await markRecipientAck(token);
        // We return success even if previously acked (res will be null because of status != 'ACKNOWLEDGED' check)
        // to prevent users from seeing an "Error" page on a second click.
        return json({ success: true, alreadyAcked: !res });
    } catch (e) {
        console.error(e);
        return json({ error: 'Internal Error' }, { status: 500 });
    }
};
