import { json, error } from '@sveltejs/kit';
import { StudentPIIService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401);

    const masked = url.searchParams.get('masked') === 'true';

    try {
        if (masked) {
            const data = await StudentPIIService.getMaskedPII(params.id);
            return json(data);
        } else {
            const data = await StudentPIIService.decryptPII(
                params.id,
                locals.user.role as string,
                locals.user.id
            );
            return json(data);
        }
    } catch (e: any) {
        throw error(e.message?.includes('permission') ? 403 : 500, e.message);
    }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    const allowedRoles = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR'];
    if (!allowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Insufficient permissions to update PII');
    }

    const piiData = await request.json();
    const result = await StudentPIIService.encryptAndStorePII(params.id, piiData, locals.user.id);
    return json(result);
};
