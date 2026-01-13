import { getDayPlanReport } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const universityId = url.searchParams.get('universityId') || locals.user.university_id || undefined;

    // Reuse the logic from reports/day-plan since user says "it should show entire report"
    const report = await getDayPlanReport(date, universityId === 'ALL' ? undefined : universityId);

    return {
        report,
        selectedDate: date,
        role: locals.user.role
    };
};
