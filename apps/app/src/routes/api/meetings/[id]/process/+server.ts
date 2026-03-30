import { getMeetingById, getActiveMeetingConnection } from '@uniconnect/shared';
import { processMeeting } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// POST: Trigger processing of a meeting (scan Drive, extract transcript, generate AI report)
export const POST: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const meeting = await getMeetingById(params.id);
    if (!meeting) throw error(404, 'Meeting not found');

    const connectionId = meeting.meeting_connection_id;
    if (!connectionId) {
        // Try to find an active connection for this university
        const connection = await getActiveMeetingConnection(meeting.university_id);
        if (!connection) {
            throw error(400, 'No meeting bot connected. Please connect a Google account first.');
        }
        // Use this connection
        await processMeeting(connection.id, params.id);
    } else {
        await processMeeting(connectionId, params.id);
    }

    // Return updated meeting
    const updated = await getMeetingById(params.id);
    return json({ success: true, meeting: updated });
};
