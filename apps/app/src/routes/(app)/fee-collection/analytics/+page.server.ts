import { getFeePeriods, getActiveFeePeriod } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const role = locals.user.role as string;
    const perms: string[] = locals.user.permissions || [];
    const isAdmin = ['ADMIN', 'PROGRAM_OPS'].includes(role);
    const hasPerm = isAdmin || perms.includes('fee-collection');
    if (!hasPerm) throw error(403, 'You do not have access to Fee Collection.');

    const periods = await getFeePeriods();
    const active = await getActiveFeePeriod();

    return {
        user: locals.user,
        periods,
        activePeriod: active,
    };
};
