import { getMeetings, getMeetingStats, createMeeting, getActiveMeetingConnection } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: List meetings with filters
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || locals.user.university_id;
    const status = url.searchParams.get('status') || undefined;
    const organizerEmail = url.searchParams.get('organizer') || undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeStats = url.searchParams.get('stats') === 'true';

    const [meetingData, stats] = await Promise.all([
        getMeetings({ universityId: universityId || undefined, status, organizerEmail, startDate, endDate, limit, offset }),
        includeStats ? getMeetingStats(universityId || undefined) : null
    ]);

    return json({
        ...meetingData,
        stats: stats || undefined
    });
};

// POST: Manually add a meeting (for ad-hoc meetings without calendar events)
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const { title, meetLink, organizerEmail, scheduledStart, scheduledEnd, universityId } = body;

    if (!title || !organizerEmail) {
        throw error(400, 'Title and organizer email are required');
    }

    const univId = universityId || locals.user.university_id;
    if (!univId) throw error(400, 'University ID required');

    // Extract meet code from link
    let meetCode: string | null = null;
    if (meetLink) {
        const match = meetLink.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
        meetCode = match ? match[1] : null;
    }

    // Find active connection for this university
    const connection = await getActiveMeetingConnection(univId);

    const meeting = await createMeeting({
        university_id: univId,
        meeting_connection_id: connection?.id || null,
        google_meet_code: meetCode,
        title,
        organizer_email: organizerEmail,
        meet_link: meetLink || null,
        scheduled_start: scheduledStart ? new Date(scheduledStart) : null,
        scheduled_end: scheduledEnd ? new Date(scheduledEnd) : null,
        source: 'MANUAL',
        status: 'DISCOVERED'
    } as any);

    return json({ success: true, meeting });
};
