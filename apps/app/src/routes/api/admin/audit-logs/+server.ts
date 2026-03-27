import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const allowedRoles = ['ADMIN', 'PROGRAM_OPS'];
    if (!allowedRoles.includes(locals.user.role as string)) {
        throw error(403, 'Only administrators can view audit logs');
    }

    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const userId = url.searchParams.get('userId');
    const accessType = url.searchParams.get('accessType');
    const studentProfileId = url.searchParams.get('studentProfileId');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) {
        conditions.push(`dal.created_at >= $${paramIdx++}`);
        params.push(new Date(startDate));
    }
    if (endDate) {
        conditions.push(`dal.created_at <= $${paramIdx++}`);
        params.push(new Date(endDate));
    }
    if (userId) {
        conditions.push(`dal.accessed_by = $${paramIdx++}`);
        params.push(userId);
    }
    if (accessType) {
        conditions.push(`dal.access_type = $${paramIdx++}`);
        params.push(accessType);
    }
    if (studentProfileId) {
        conditions.push(`dal.student_profile_id = $${paramIdx++}`);
        params.push(studentProfileId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [logsResult, countResult] = await Promise.all([
        db.query(
            `SELECT dal.*,
                    u.name as accessor_name, u.email as accessor_email, u.role as accessor_role,
                    d.file_name as document_name, d.document_type,
                    su.name as student_name, sp.enrollment_number
             FROM document_access_logs dal
             LEFT JOIN users u ON dal.accessed_by = u.id
             LEFT JOIN documents d ON dal.document_id = d.id
             LEFT JOIN student_profiles sp ON dal.student_profile_id = sp.id
             LEFT JOIN users su ON sp.user_id = su.id
             ${whereClause}
             ORDER BY dal.created_at DESC
             LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            [...params, limit, offset]
        ),
        db.query(
            `SELECT COUNT(*) as total FROM document_access_logs dal ${whereClause}`,
            params
        )
    ]);

    return json({
        logs: logsResult.rows,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || '0', 10) / limit)
    });
};
