import { error } from '@sveltejs/kit';
import { getPettyCashRequestById } from '@uniconnect/shared';
import { assertUniversityAccess, isFinance, canApproveStage, pendingLevel, isGlobalAdmin } from '$lib/server/petty_cash_access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const user = locals.user!;
    const detail = await getPettyCashRequestById(params.id);
    if (!detail) throw error(404, 'Request not found');
    assertUniversityAccess(user, detail.request.university_id);
    return {
        ...detail,
        me: { id: user.id, name: user.name, email: user.email, role: user.role },
        caps: {
            isFinance: isFinance(user),
            isAdmin: isGlobalAdmin(user),
            // Can the acting user approve at THIS request's current stage?
            canApprove: canApproveStage(user, detail.request.status),
            // Which level the request is waiting on (1 = Pravalika, 2 = Satish), else null.
            pendingLevel: pendingLevel(detail.request.status),
        },
    };
};
