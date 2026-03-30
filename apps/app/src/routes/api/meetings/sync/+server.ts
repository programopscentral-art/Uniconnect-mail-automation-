import { getActiveMeetingConnection } from '@uniconnect/shared';
import { syncCalendarMeetings } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// POST: Sync meetings from Google Calendar for current user
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json().catch(() => ({}));

    const connection = await getActiveMeetingConnection(locals.user.id);
    if (!connection) {
        throw error(400, 'No Google account connected. Please connect your Google account first.');
    }

    const result = await syncCalendarMeetings(connection.id, locals.user.id, {
        timeMin: body.timeMin,
        timeMax: body.timeMax
    });

    return json({
        success: true,
        synced: result.synced,
        skipped: result.skipped,
        message: `Synced ${result.synced} new meetings (${result.skipped} already existed)`
    });
};
