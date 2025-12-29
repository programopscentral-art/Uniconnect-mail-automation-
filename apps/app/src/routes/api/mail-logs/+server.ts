import { json, error } from '@sveltejs/kit';
import { getMailLogs, getMailLogsCount } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const userRole = locals.user.role as string;
    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';

    // Multi-tenant isolation
    const university_id = isGlobalAdmin ? (url.searchParams.get('university_id') || undefined) : (locals.user.university_id as string | undefined);

    if (!isGlobalAdmin && university_id !== locals.user.university_id) {
        throw error(403, 'Permission denied');
    }

    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const [logs, total] = await Promise.all([
        getMailLogs({ university_id: university_id as string | undefined, limit, offset }),
        getMailLogsCount(university_id as string | undefined)
    ]);

    return json({ logs, total });
};
