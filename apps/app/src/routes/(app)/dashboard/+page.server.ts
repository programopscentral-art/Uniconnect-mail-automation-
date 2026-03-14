import { getDashboardStats, getTaskStats, getAllUniversities, getTasks, getScheduleEvents, getDayPlans, getAllUsers, getCalendarFreezes } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const today = new Date().toISOString().split('T')[0];
    let universityId = url.searchParams.get('universityId');

    // AUTO-SCOPE: If no universityId is selected, default to the user's university
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    // Normalize universityId: empty string should be undefined for DB queries
    const effectiveUniversityId = (universityId && universityId !== '') ? universityId : undefined;

    console.log('[DASHBOARD_LOAD] UniversityId:', universityId);

    const hasCampaigns = locals.user.permissions?.includes('campaigns');
    const hasTasks = locals.user.permissions?.includes('tasks');

    try {
        const [stats, rawTaskStats, universities, tasks, scheduleEvents, dayPlans, allUsers, calendarFreezes] = await Promise.all([
            hasCampaigns ? getDashboardStats(effectiveUniversityId) : Promise.resolve({
                total_campaigns: 0, active_campaigns: 0, total_emails_sent: 0,
                avg_open_rate: 0, remaining_credits: 0, recent_campaigns: [],
                daily_activity: []
            }),
            hasTasks ? getTaskStats(effectiveUniversityId, locals.user.id) : Promise.resolve({
                PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, OVERDUE: 0
            } as any),
            ['ADMIN', 'PROGRAM_OPS', 'PM', 'PMA', 'COS'].includes(locals.user.role as string) ? getAllUniversities(effectiveUniversityId) : Promise.resolve([]),
            hasTasks ? getTasks({
                university_id: effectiveUniversityId,
                creator_id: (locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS') ? undefined : locals.user.id,
                limit: 1000
            }) : Promise.resolve([]),
            getScheduleEvents(effectiveUniversityId || locals.user.university_id || undefined),
            getDayPlans(locals.user.id, today),
            hasTasks ? getAllUsers(effectiveUniversityId || undefined, { minimal: true }) : Promise.resolve([]),
            getCalendarFreezes(effectiveUniversityId || undefined).catch((e) => { console.error('[DASHBOARD_LOAD] Calendar freezes error:', e.message); return []; })
        ]);

        console.log('[DASHBOARD_LOAD] Stats Fetched Successfully');

        const taskStats = {
            total: (rawTaskStats.PENDING || 0) + (rawTaskStats.IN_PROGRESS || 0) + (rawTaskStats.COMPLETED || 0) + (rawTaskStats.CANCELLED || 0),
            completed: rawTaskStats.COMPLETED || 0,
            pending: rawTaskStats.PENDING || 0,
            in_progress: rawTaskStats.IN_PROGRESS || 0,
            overdue: rawTaskStats.OVERDUE || 0
        };

        return {
            stats,
            taskStats,
            universities,
            tasks: tasks || [],
            allUsers: allUsers || [],
            scheduleEvents: scheduleEvents || [],
            dayPlans: dayPlans || [],
            calendarFreezes: calendarFreezes || [],
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
            userName: locals.user.name,
            defaultUniversityId: locals.user.university_id,
            userPermissions: locals.user.permissions || []
        };
    } catch (err: any) {
        console.error('[DASHBOARD_LOAD] CRITICAL ERROR:', err);
        return {
            stats: {
                total_campaigns: 0, active_campaigns: 0, total_emails_sent: 0,
                avg_open_rate: 0, remaining_credits: 0, recent_campaigns: [],
                daily_activity: []
            },
            taskStats: { total: 0, completed: 0, pending: 0, in_progress: 0, overdue: 0 },
            universities: [],
            tasks: [],
            allUsers: [],
            scheduleEvents: [],
            dayPlans: [],
            calendarFreezes: [],
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
            userName: locals.user.name,
            userPermissions: locals.user?.permissions || [],
            error: `Load Error: ${err.message} `
        };
    }
};
