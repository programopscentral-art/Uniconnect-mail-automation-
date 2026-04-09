import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// One-time recovery endpoint: searches Google Calendar for a meeting by meet code
// and imports all attendees as invitees + searches Drive for attendance CSV
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { meetingId } = await request.json();
    if (!meetingId) throw error(400, 'meetingId required');

    try {
        const { db } = await import('@uniconnect/shared/db/client');

        // Get the meeting
        const meetingRes = await db.query('SELECT * FROM org_meetings WHERE id = $1', [meetingId]);
        const meeting = meetingRes.rows[0];
        if (!meeting) throw error(404, 'Meeting not found');

        const meetCode = meeting.google_meet_code;
        if (!meetCode) throw error(400, 'Meeting has no meet code');

        // Get active meeting connection
        const connRes = await db.query("SELECT * FROM meeting_connections WHERE status = 'ACTIVE' LIMIT 1");
        const conn = connRes.rows[0];
        if (!conn) throw error(400, 'No active Google connection');

        // Decrypt refresh token and create OAuth client
        const { decryptString } = await import('@uniconnect/shared/crypto');
        const refreshToken = decryptString(conn.refresh_token_enc);

        const { google } = await import('googleapis');
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials({ refresh_token: refreshToken });

        const calendar = google.calendar({ version: 'v3', auth });
        const drive = google.drive({ version: 'v3', auth });

        // Search calendar for events with this meet code (past 30 days)
        const now = new Date();
        const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

        let foundEvent = null;
        let pageToken: string | undefined;

        do {
            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 250,
                pageToken
            });

            const events = response.data.items || [];
            for (const event of events) {
                const meetLink = event.conferenceData?.entryPoints?.find(
                    (ep: any) => ep.entryPointType === 'video'
                )?.uri || event.hangoutLink || '';

                if (meetLink.includes(meetCode)) {
                    foundEvent = event;
                    break;
                }
            }
            if (foundEvent) break;
            pageToken = response.data.nextPageToken || undefined;
        } while (pageToken);

        let inviteeCount = 0;
        let participantCount = 0;
        let attendanceFound = false;

        // If calendar event found, import attendees
        if (foundEvent && foundEvent.attendees) {
            const { upsertMeetingInvitee, updateMeeting } = await import('@uniconnect/shared');

            // Update meeting title from calendar
            await updateMeeting(meetingId, {
                google_event_id: foundEvent.id,
                title: foundEvent.summary || meeting.title,
                scheduled_start: foundEvent.start?.dateTime ? new Date(foundEvent.start.dateTime) : meeting.scheduled_start,
                scheduled_end: foundEvent.end?.dateTime ? new Date(foundEvent.end.dateTime) : meeting.scheduled_end,
            });

            for (const attendee of foundEvent.attendees) {
                if (!attendee.email) continue;
                await upsertMeetingInvitee({
                    meeting_id: meetingId,
                    email: attendee.email,
                    name: attendee.displayName || undefined,
                    response_status: attendee.responseStatus || 'needsAction',
                    is_organizer: attendee.organizer || false
                });
                inviteeCount++;
            }
        }

        // Search Drive for attendance CSV with this meet code
        try {
            const csvSearches = [
                `mimeType='text/csv' AND name contains '${meetCode}'`,
                `mimeType='text/csv' AND name contains 'attendance'`,
                `mimeType='application/vnd.google-apps.spreadsheet' AND name contains '${meetCode}'`,
                `mimeType='application/vnd.google-apps.spreadsheet' AND name contains 'Attendance report'`,
            ];

            for (const query of csvSearches) {
                const searchRes = await drive.files.list({
                    q: query,
                    fields: 'files(id, name, webViewLink, modifiedTime, mimeType)',
                    orderBy: 'modifiedTime desc',
                    pageSize: 10
                });

                const files = searchRes.data.files || [];
                console.log(`[RECOVER] Drive search "${query}" found ${files.length} files`);
                files.forEach((f: any) => console.log(`  - ${f.name} (${f.id}) modified ${f.modifiedTime}`));

                if (files.length > 0) {
                    attendanceFound = true;
                    // Try to parse the first matching file
                    for (const file of files) {
                        try {
                            let csvText: string;
                            if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
                                // Export Google Sheet as CSV
                                const exported = await drive.files.export(
                                    { fileId: file.id!, mimeType: 'text/csv' },
                                    { responseType: 'text' }
                                );
                                csvText = exported.data as string;
                            } else {
                                const downloaded = await drive.files.get(
                                    { fileId: file.id!, alt: 'media' },
                                    { responseType: 'text' }
                                );
                                csvText = downloaded.data as string;
                            }

                            const lines = csvText.split('\n').filter((l: string) => l.trim());
                            if (lines.length < 2) continue;

                            const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/"/g, ''));
                            console.log('[RECOVER] CSV headers:', header);

                            const nameIdx = header.findIndex((h: string) => h.includes('name') || h.includes('participant'));
                            const emailIdx = header.findIndex((h: string) => h.includes('email'));
                            const durationIdx = header.findIndex((h: string) => h.includes('duration'));
                            const joinIdx = header.findIndex((h: string) => h.includes('join') || h.includes('start'));
                            const leaveIdx = header.findIndex((h: string) => h.includes('leave') || h.includes('end') || h.includes('exit'));

                            const { upsertMeetingParticipant, updateMeeting } = await import('@uniconnect/shared');

                            for (let i = 1; i < lines.length; i++) {
                                const cols = lines[i].split(',').map((c: string) => c.trim().replace(/"/g, ''));
                                const name = nameIdx >= 0 ? cols[nameIdx] : `Participant ${i}`;
                                if (!name) continue;

                                const email = emailIdx >= 0 ? cols[emailIdx] : undefined;
                                const joinRaw = joinIdx >= 0 ? cols[joinIdx] : undefined;
                                const leaveRaw = leaveIdx >= 0 ? cols[leaveIdx] : undefined;

                                await upsertMeetingParticipant({
                                    meeting_id: meetingId,
                                    name,
                                    email: email || undefined,
                                    duration_minutes: durationIdx >= 0 ? parseInt(cols[durationIdx]) || undefined : undefined,
                                    join_time: joinRaw ? new Date(joinRaw) : undefined,
                                    leave_time: leaveRaw ? new Date(leaveRaw) : undefined,
                                    source: 'ATTENDANCE_CSV'
                                });
                                participantCount++;
                            }

                            if (participantCount > 0) {
                                await updateMeeting(meetingId, {
                                    participant_count: participantCount,
                                    attendance_file_id: file.id
                                });
                                break; // Found and parsed successfully
                            }
                        } catch (parseErr: any) {
                            console.error(`[RECOVER] Failed to parse ${file.name}:`, parseErr.message);
                        }
                    }
                    if (participantCount > 0) break;
                }
            }
        } catch (driveErr: any) {
            console.error('[RECOVER] Drive search failed:', driveErr.message);
        }

        return json({
            success: true,
            calendarEventFound: !!foundEvent,
            calendarTitle: foundEvent?.summary,
            inviteesImported: inviteeCount,
            attendanceFileFound: attendanceFound,
            participantsImported: participantCount
        });
    } catch (e: any) {
        console.error('[RECOVER]', e);
        throw error(500, e.message);
    }
};
