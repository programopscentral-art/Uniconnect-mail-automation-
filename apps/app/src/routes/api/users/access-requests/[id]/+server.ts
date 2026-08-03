import { json, error } from '@sveltejs/kit';
import { updateAccessRequestStatus, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user || locals.user.role !== 'ADMIN') throw error(401);

    const { id } = params;
    const body = await request.json();
    const status = body.status;
    const roleOverride = body.role as string | undefined; // optional: admin picks a role

    if (!['APPROVED', 'REJECTED'].includes(status)) {
        throw error(400, 'Invalid status');
    }

    const VALID_ROLES = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'BOA', 'CMA', 'CMA_MANAGER', 'SET_REVIEWER', 'PROPOSER', 'FACULTY', 'STUDENT', 'STAKEHOLDER', 'SUPPORT', 'SME'];
    // Don't auto-grant top-level admin roles from a self-requested intent — those
    // require the admin to pass an explicit `role` override.
    const ELEVATED = ['ADMIN', 'PROGRAM_OPS'];

    try {
        const ar = await updateAccessRequestStatus(id, status);

        if (status === 'APPROVED') {
            // Apply the REQUESTED role (role_intent) on approval — previously only
            // university_id was set, so approved BOA/PMA/etc. requests silently
            // stayed on the login default (UNIVERSITY_OPERATOR).
            let targetRole: string | null =
                roleOverride && VALID_ROLES.includes(roleOverride) ? roleOverride
                : (ar.role_intent && VALID_ROLES.includes(ar.role_intent)) ? ar.role_intent
                : null;
            if (targetRole && ELEVATED.includes(targetRole) && !roleOverride) targetRole = null;

            const primaryUni = ar.university_ids && ar.university_ids.length > 0 ? ar.university_ids[0] : null;
            if (targetRole && primaryUni) {
                await db.query(`UPDATE users SET role = $1, university_id = $2, updated_at = NOW() WHERE id = $3`, [targetRole, primaryUni, ar.user_id]);
            } else if (targetRole) {
                await db.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [targetRole, ar.user_id]);
            }
        }

        return json(ar);
    } catch (err: any) {
        console.error('Failed to update access request:', err);
        throw error(500, 'Internal Server Error');
    }
};
