import { getDashboardStats, getTaskStats, getAllUniversities, getTasks, getScheduleEvents, getDayPlans, getAllUsers } from '@uniconnect/shared';
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
        const [stats, rawTaskStats, universities, tasks, scheduleEvents, dayPlans, allUsers] = await Promise.all([
            hasCampaigns ? getDashboardStats(effectiveUniversityId) : Promise.resolve({
                total_campaigns: 0, active_campaigns: 0, total_emails_sent: 0,
                avg_open_rate: 0, remaining_credits: 0, recent_campaigns: [],
                daily_activity: []
            }),
            hasTasks ? getTaskStats(effectiveUniversityId, locals.user.id) : Promise.resolve({
                PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, OVERDUE: 0
            } as any),
            locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' ? getAllUniversities(effectiveUniversityId) : Promise.resolve([]),
            // Upcoming tasks: show tasks created by or assigned to self
            hasTasks ? getTasks({
                university_id: effectiveUniversityId,
                creator_id: (locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS') ? undefined : locals.user.id
            }) : Promise.resolve([]),
            getScheduleEvents(effectiveUniversityId || locals.user.university_id || undefined),
            getDayPlans(locals.user.id, today),
            hasTasks ? getAllUsers(effectiveUniversityId || undefined) : Promise.resolve([])
        ]);

        console.log('[DASHBOARD_LOAD] Stats Fetched Successfully');

        // Transform Task Stats to match UI expectation { total, completed, pending, overdue }
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
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
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
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
            userPermissions: locals.user?.permissions || [],
            error: `Load Error: ${err.message} `
        };
    }
};
