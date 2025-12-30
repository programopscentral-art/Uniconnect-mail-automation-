import { getDashboardStats, getTaskStats, getAllUniversities, getTasks, getScheduleEvents } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');

    // AUTO-SCOPE: If no universityId is selected, default to the user's university
    if (!universityId && locals.user.university_id) {
        universityId = locals.user.university_id;
    }

    // Normalize universityId: empty string should be undefined for DB queries
    const effectiveUniversityId = (universityId && universityId !== '') ? universityId : undefined;

    console.log('[DASHBOARD_LOAD] UniversityId:', universityId);

    try {
        const [stats, rawTaskStats, universities, tasks, scheduleEvents] = await Promise.all([
            getDashboardStats(effectiveUniversityId),
            getTaskStats(effectiveUniversityId),
            locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' ? getAllUniversities() : Promise.resolve([]),
            // Upcoming tasks: only show self-assigned tasks
            getTasks({ assigned_to: locals.user.id }),
            getScheduleEvents(effectiveUniversityId || locals.user.university_id || undefined)
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
            scheduleEvents: scheduleEvents || [],
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
            defaultUniversityId: locals.user.university_id
        };
    } catch (err: any) {
        console.error('[DASHBOARD_LOAD] CRITICAL ERROR:', err);
        return {
            stats: {
                total_campaigns: 0, active_campaigns: 0, total_emails_sent: 0,
                avg_open_rate: 0, remaining_credits: 0, recent_campaigns: [],
                daily_activity: []
            },
            taskStats: { total: 0, completed: 0, pending: 0, overdue: 0 },
            universities: [],
            tasks: [],
            scheduleEvents: [], // Added missing field
            selectedUniversityId: universityId,
            userRole: locals.user.role,
            userId: locals.user.id,
            error: `Load Error: ${err.message}`
        };
    }
};
