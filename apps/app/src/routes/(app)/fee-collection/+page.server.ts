import { getAllUniversities, getFeePeriods, getActiveFeePeriod, createFeePeriod } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    // Permission check: ADMIN/PROGRAM_OPS always allowed; others need 'fee-collection' permission
    const role = locals.user.role as string;
    const perms: string[] = locals.user.permissions || [];
    const isAdmin = ['ADMIN', 'PROGRAM_OPS'].includes(role);
    const hasPerm = isAdmin || perms.includes('fee-collection');
    if (!hasPerm) {
        throw error(403, 'You do not have access to Fee Collection. Ask an admin to enable the "fee-collection" permission for your role.');
    }

    let periods = await getFeePeriods();
    let active = await getActiveFeePeriod();

    // Bootstrap: if no period exists, auto-create one ("NIAT 2025 · Term 2") so the page is usable on first load
    if (!periods.length) {
        const p = await createFeePeriod({
            name: 'NIAT 2025 · Term 2',
            program: 'NIAT 2025',
            term: 2,
            academic_year: '2025-26',
            created_by: locals.user.id
        });
        periods = [p];
        active = p;
    }

    const universities = await getAllUniversities();

    const editRoles = ['PM', 'PMA', 'COS', 'CMA', 'CMA_MANAGER', 'BOA'];
    const canEditRemarks = isAdmin || editRoles.includes(role);
    const canEditPayments = isAdmin;
    const canAdmin = isAdmin;

    return {
        user: locals.user,
        userRole: role,
        userName: locals.user.name || locals.user.email,
        periods,
        activePeriod: active,
        universities: universities.filter((u: any) => !u.is_team),
        access: {
            canEditRemarks,
            canEditPayments,
            canAdmin,
        }
    };
};
