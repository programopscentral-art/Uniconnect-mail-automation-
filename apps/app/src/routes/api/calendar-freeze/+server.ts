import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { freezeCalendarDate, unfreezeCalendarDate, getCalendarFreezes, getCalendarFreezesForDateRange, createNotification, getAllUsers } from '@uniconnect/shared';

const FREEZE_ROLES = ['PM', 'PMA', 'COS', 'CMA', 'CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS'];
const SE_ROLES = ['SE', 'STUDENT_ENGAGEMENT', 'SE_MANAGER', 'SE_TEAM'];

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('university_id')?.trim() || undefined;
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    if (startDate && endDate) {
        const freezes = await getCalendarFreezesForDateRange(startDate, endDate, universityId);
        return json(freezes);
    }

    const freezes = await getCalendarFreezes(universityId);
    return json(freezes);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    // Only PM, PMA, COS, ADMIN can freeze
    if (!FREEZE_ROLES.includes(locals.user.role as string)) {
        throw error(403, 'Only PM, PMA, COS, or Admin can freeze calendar dates');
    }

    const body = await request.json();
    const { university_id, freeze_dates, reason } = body;

    if (!university_id) throw error(400, 'University ID required');
    if (!freeze_dates || !Array.isArray(freeze_dates) || freeze_dates.length === 0) {
        throw error(400, 'At least one date required');
    }

    const results = [];
    for (const date of freeze_dates) {
        const freeze = await freezeCalendarDate(university_id, date, reason || 'Calendar frozen', locals.user.id);
        results.push(freeze);
    }

    // Notify Student Engagement team members
    try {
        const allUsers = await getAllUsers(undefined, { minimal: true });
        const seUsers = allUsers.filter((u: any) =>
            SE_ROLES.includes(u.role) ||
            u.role === 'BOA' ||
            u.role === 'PROGRAM_OPS' ||
            u.role === 'ADMIN'
        );

        const datesList = freeze_dates.map((d: string) => new Date(d).toLocaleDateString()).join(', ');

        for (const seUser of seUsers) {
            await createNotification({
                user_id: seUser.id,
                university_id,
                title: 'Calendar Dates Frozen',
                message: `${locals.user.name || 'A team member'} has frozen the following dates: ${datesList}. Reason: ${reason || 'Not specified'}`,
                type: 'SYSTEM',
                link: '/dashboard',
                source_id: `freeze-${university_id}-${freeze_dates[0]}-${Date.now()}`
            });
        }
    } catch (e: any) {
        console.error('[CALENDAR_FREEZE] Notification error:', e.message);
    }

    return json({ frozen: results.length, freezes: results });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    if (!FREEZE_ROLES.includes(locals.user.role as string)) {
        throw error(403, 'Only PM, PMA, COS, or Admin can unfreeze calendar dates');
    }

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'Freeze ID required');

    await unfreezeCalendarDate(id);
    return json({ success: true });
};
