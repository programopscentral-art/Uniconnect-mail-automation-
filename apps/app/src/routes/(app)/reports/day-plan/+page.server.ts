import { getDayPlanReport } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    // Only COS/PM and above can see report? or everyone?
    // User requested: "administrators have granular control".
    // Let's assume ADMIN and COS/PM for now.
    const allowedRoles = ['ADMIN', 'COS/PM'];
    if (!allowedRoles.includes(locals.user.role)) {
        throw error(403, 'Unauthorized to view team reports');
    }

    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const universityId = url.searchParams.get('universityId') || locals.user.university_id || undefined;

    const report = await getDayPlanReport(date, universityId === 'ALL' ? undefined : universityId);

    return {
        report,
        selectedDate: date,
        selectedUniversityId: universityId
    };
};
