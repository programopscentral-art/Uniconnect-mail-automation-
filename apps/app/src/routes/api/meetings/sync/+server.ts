import { getActiveMeetingConnection } from '@uniconnect/shared';
import { syncCalendarMeetings } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// POST: Sync meetings from Google Calendar
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json().catch(() => ({}));
    const universityId = body.universityId || locals.user.university_id;

    if (!universityId) throw error(400, 'University ID required');

    const connection = await getActiveMeetingConnection(universityId);
    if (!connection) {
        throw error(400, 'No meeting bot connected for this university. Please connect a Google account first.');
    }

    const result = await syncCalendarMeetings(connection.id, universityId, {
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
