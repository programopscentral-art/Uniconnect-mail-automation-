import { getPettyCashRequests, getPettyCashDashboardStats, listPettyCashEligibility, db } from '@uniconnect/shared';
import { isGlobalAdmin, isFinance, isApprover, scopeUniversity } from '$lib/server/petty_cash_access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user!;
    const admin = isGlobalAdmin(user);
    const finance = isFinance(user);
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

    // Finance command-center: pull Budget Proposals alongside Petty Cash so the
    // overview shows every finance flow and where each item sits.
    let budget: any = null;
    if (finance) {
        const uw = university_id ? `WHERE university_id = $1` : '';
        const args = university_id ? [university_id] : [];
        const counts = await db.query(`SELECT status, COUNT(*)::int AS n FROM budget_proposals ${uw} GROUP BY status`, args);
        const totals = await db.query(
            `SELECT
                COUNT(*) FILTER (WHERE status IN ('SUBMITTED','UNDER_REVIEW'))::int AS needs_review,
                COUNT(*) FILTER (WHERE status = 'APPROVED_L1')::int AS l1_approved,
                COALESCE(SUM(estimated_total_budget) FILTER (WHERE status IN ('SUBMITTED','UNDER_REVIEW','APPROVED_L1')), 0) AS pending_value
             FROM budget_proposals ${uw}`, args);
        const recent = await db.query(
            `SELECT p.id, p.title, p.status, p.estimated_total_budget, p.updated_at, COALESCE(u.short_name, u.name) AS university_name
               FROM budget_proposals p JOIN universities u ON u.id = p.university_id
               ${university_id ? 'WHERE p.university_id = $1' : ''}
               ORDER BY p.updated_at DESC LIMIT 6`, args);
        const countMap: Record<string, number> = {};
        for (const r of counts.rows) countMap[r.status] = r.n;
        budget = {
            counts: countMap,
            needs_review: totals.rows[0].needs_review,
            l1_approved: totals.rows[0].l1_approved,
            pending_value: Number(totals.rows[0].pending_value) || 0,
            recent: recent.rows,
        };
    }

    return {
        requests,
        stats,
        eligibility,
        universities,
        budget,
        me: { id: user.id, name: user.name, email: user.email, role: user.role },
        caps: { isAdmin: admin, isFinance: finance, canApprove: isApprover(user) },
    };
};
