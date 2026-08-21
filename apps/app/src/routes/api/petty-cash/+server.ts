import { json, error } from '@sveltejs/kit';
import { getPettyCashRequests, createPettyCashRequest, getPettyCashEligibility, getOpenAdvanceForUser } from '@uniconnect/shared';
import { assertUniversityAccess, scopeUniversity } from '$lib/server/petty_cash_access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const view = url.searchParams.get('view') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const mine = url.searchParams.get('mine') === 'true';
    const university_id = scopeUniversity(locals.user, url.searchParams.get('university_id') || undefined);

    const requests = await getPettyCashRequests({
        university_id,
        requester_user_id: mine ? locals.user.id : undefined,
        view,
        search,
    });
    return json(requests);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);
    const data = await request.json();

    if (!data.university_id) throw error(400, 'University is required');
    if (!data.purpose) throw error(400, 'Purpose is required');
    if (!data.amount_requested || Number(data.amount_requested) <= 0) throw error(400, 'A valid amount is required');

    assertUniversityAccess(locals.user, data.university_id);

    // Eligibility cap check (soft — only enforced when a register entry exists).
    const elig = await getPettyCashEligibility(locals.user.id, data.university_id);
    if (elig) {
        if (Number(data.amount_requested) > Number(elig.max_per_request)) {
            throw error(400, `Amount exceeds your per-request cap of ₹${Number(elig.max_per_request).toLocaleString('en-IN')}.`);
        }
        const open = await getOpenAdvanceForUser(locals.user.id);
        if (open + Number(data.amount_requested) > Number(elig.max_open_advance)) {
            throw error(400, `This would exceed your open-advance cap of ₹${Number(elig.max_open_advance).toLocaleString('en-IN')} (₹${open.toLocaleString('en-IN')} already outstanding).`);
        }
    }

    const created = await createPettyCashRequest({
        university_id: data.university_id,
        requester_user_id: locals.user.id,
        requester_name: locals.user.name || undefined,
        requester_email: locals.user.email,
        purpose: data.purpose,
        category: data.category || 'MISC',
        payee_vendor: data.payee_vendor,
        amount_requested: Number(data.amount_requested),
        needed_by: data.needed_by || null,
        linked_activity: data.linked_activity,
    });
    return json(created, { status: 201 });
};
