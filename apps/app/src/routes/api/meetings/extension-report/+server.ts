import {
    createMeeting, getMeetingByMeetCode, updateMeeting,
    upsertMeetingParticipant, getActiveMeetingConnection,
    getMeetingById
} from '@uniconnect/shared';
import { generateAiReport } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// POST: Receive meeting report from Chrome extension
export const POST: RequestHandler = async ({ request, locals }) => {
    // Auth: either via session cookie or Bearer token
    let userId: string | null = null;

    if (locals.user) {
        userId = locals.user.id;
    } else {
        // Try Bearer token auth (for extension)
        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            try {
                const { validateSession } = await import('@uniconnect/shared');
                const user = await validateSession(token);
                if (user) {
                    userId = user.id;
                }
            } catch {
                // Invalid token
            }
        }
    }

    if (!userId) {
        throw error(401, 'Authentication required. Configure your auth token in the extension settings.');
    }

    const report = await request.json();

    if (!report.meetCode && !report.title) {
        throw error(400, 'Meeting code or title is required');
    }

    try {
        // Check if this meeting already exists (from Calendar sync or manual add)
        let meeting = report.meetCode ? await getMeetingByMeetCode(report.meetCode) : null;

        if (!meeting) {
            // Create new meeting from extension data
            const connection = userId ? await getActiveMeetingConnection(userId) : null;

            meeting = await createMeeting({
                user_id: userId,
                meeting_connection_id: connection?.id || null,
                google_meet_code: report.meetCode || null,
                title: report.title || `Meeting ${report.meetCode}`,
                organizer_email: locals.user?.email || 'unknown',
                organizer_name: locals.user?.name || undefined,
                meet_link: report.meetCode ? `https://meet.google.com/${report.meetCode}` : null,
                scheduled_start: report.startTime ? new Date(report.startTime) : new Date(),
                scheduled_end: report.endTime ? new Date(report.endTime) : null,
                source: 'MANUAL',
                status: 'PROCESSING'
            } as any);
        }

        // Update meeting with extension data
        await updateMeeting(meeting.id, {
            actual_start: report.startTime ? new Date(report.startTime) : undefined,
            actual_end: report.endTime ? new Date(report.endTime) : undefined,
            duration_minutes: report.durationMinutes || undefined,
            participant_count: report.participants?.length || 0,
            status: 'PROCESSING'
        });

        // Upsert participants
        if (report.participants && Array.isArray(report.participants)) {
            for (const p of report.participants) {
                await upsertMeetingParticipant({
                    meeting_id: meeting.id,
                    name: p.name,
                    email: p.email || undefined,
                    join_time: p.joinEvents?.[0] ? new Date(p.joinEvents[0]) : undefined,
                    leave_time: p.leaveEvents?.length > 0 ? new Date(p.leaveEvents[p.leaveEvents.length - 1]) : undefined,
                    duration_minutes: p.totalDurationMinutes || undefined,
                    spoke_in_transcript: p.spokeInCaptions || false,
                    speaking_segments: p.speakingSegments || 0,
                    source: 'MANUAL'
                });
            }
        }

        // Save caption transcript if available
        if (report.captionTranscript) {
            await updateMeeting(meeting.id, {
                raw_transcript: report.captionTranscript
            });

            // Generate AI report from caption transcript
            try {
                await generateAiReport(meeting.id);
            } catch (e: any) {
                console.error('[EXTENSION_REPORT] AI report generation failed:', e.message);
            }
        }

        // Mark as completed
        await updateMeeting(meeting.id, { status: 'COMPLETED' });

        const updatedMeeting = await getMeetingById(meeting.id);

        return json({
            success: true,
            meetingId: meeting.id,
            message: `Meeting report saved. ${report.participants?.length || 0} participants, ${report.captions?.length || 0} caption segments.`,
            meeting: updatedMeeting
        });
    } catch (e: any) {
        console.error('[EXTENSION_REPORT] Error:', e);
        throw error(500, `Failed to process extension report: ${e.message}`);
    }
};
