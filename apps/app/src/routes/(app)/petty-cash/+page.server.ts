import { getPettyCashRequests, getPettyCashDashboardStats, listPettyCashEligibility, db } from '@uniconnect/shared';
import { isGlobalAdmin, isFinance, isApprover, scopeUniversity } from '$lib/server/petty_cash_access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user!;
    const fullAccess = (user as any).full_access === true;
    // Full-access (Central Team) users get the finance console + all-university scope,
    // even though their role isn't a finance role. Actions stay gated (approve = Satish,
    // disburse/verify/settle = finance roles) — this only widens visibility.
    const admin = isGlobalAdmin(user) || fullAccess;
    const finance = isFinance(user) || fullAccess;
    const university_id = scopeUniversity(user);

    // Universities the user can file against.
    let universities: Array<{ id: string; name: string }>;
    if (admin) {
        const { rows } = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE status = 'ACTIVE' ORDER BY name`);
        universities = rows;
    } else {
        universities = (user.universities || []).map((u: any) => ({ id: u.id, name: u.name }));
        if (universities.length === 0 && user.university_id) {
            const { rows } = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE id = $1`, [user.university_id]);
            universities = rows;
        }
    }

    // Requesters only ever load their own requests; finance loads the whole scope.
    const requests = finance
        ? await getPettyCashRequests({ university_id })
        : await getPettyCashRequests({ requester_user_id: user.id });

    const [stats, eligibility] = await Promise.all([
        getPettyCashDashboardStats(university_id),
        admin ? listPettyCashEligibility(university_id) : Promise.resolve([]),
    ]);

    return {
        requests,
        stats,
        eligibility,
        universities,
        me: { id: user.id, name: user.name, email: user.email, role: user.role },
        caps: { isAdmin: admin, isFinance: finance, canApprove: isApprover(user) },
    };
};
