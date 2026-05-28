import { getAllUniversities, getFeePeriods, getActiveFeePeriod, createFeePeriod } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    // Phase 7A.6 — redirect to the v2 page. The legacy page + tables remain
    // in the DB and codebase for read-only reference; this load just sends
    // anyone hitting /fee-collection to /fee-collection-v2 instead.
    throw redirect(302, '/fee-collection-v2');

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

    // Bootstrap: if no period exists, auto-create one so the page is usable on first load
    if (!periods.length) {
        const p = await createFeePeriod({
            name: 'NIAT · Batch 2022-26 · Term 2',
            program: 'NIAT',
            term: 2,
            academic_year: '2025-26',
            batch_start_year: 2022,
            batch_end_year: 2026,
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
