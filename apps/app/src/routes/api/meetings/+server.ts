import { getMeetings, getMeetingStats, createMeeting, getActiveMeetingConnection } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: List current user's meetings with filters
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const status = url.searchParams.get('status') || undefined;
    const organizerEmail = url.searchParams.get('organizer') || undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeStats = url.searchParams.get('stats') === 'true';

    const [meetingData, stats] = await Promise.all([
        getMeetings({ userId: locals.user.id, status, organizerEmail, startDate, endDate, limit, offset }),
        includeStats ? getMeetingStats(locals.user.id) : null
    ]);

    return json({
        ...meetingData,
        stats: stats || undefined
    });
};

// POST: Manually add a meeting
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const { title, meetLink, organizerEmail, scheduledStart, scheduledEnd } = body;

    if (!title || !organizerEmail) {
        throw error(400, 'Title and organizer email are required');
    }

    // Extract meet code from link
    let meetCode: string | null = null;
    if (meetLink) {
        const match = meetLink.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
        meetCode = match ? match[1] : null;
    }

    // Find active connection for this user
    const connection = await getActiveMeetingConnection(locals.user.id);

    const meeting = await createMeeting({
        user_id: locals.user.id,
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
