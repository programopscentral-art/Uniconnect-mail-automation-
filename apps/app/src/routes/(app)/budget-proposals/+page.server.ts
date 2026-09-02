import type { PageServerLoad } from './$types';
import { getBudgetProposals, getAllUniversities } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ url, locals }) => {
    const university_id = url.searchParams.get('university_id') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const mine = url.searchParams.get('mine') === 'true';

    // Scoping for the load function — full-access users (Central Team) see every university.
    const isGlobalAdmin = locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' || locals.user.role === 'CMA_MANAGER' || (locals.user as any).full_access === true;
    const isSET = locals.user.role === 'SET_REVIEWER';

    let effectiveUniversityId = university_id;
    if (!isGlobalAdmin && !university_id) {
        effectiveUniversityId = locals.user.university_id || undefined;
    }

    const [proposals, universities] = await Promise.all([
        getBudgetProposals({
            university_id: effectiveUniversityId,
            proposer_user_id: mine ? locals.user.id : undefined,
            status: status as any,
            limit: 50
        }),
        getAllUniversities()
    ]);

    return {
        proposals: JSON.parse(JSON.stringify(proposals)),
        universities: JSON.parse(JSON.stringify(universities)),
        filters: {
            university_id,
            status,
            mine
        }
    };
};
