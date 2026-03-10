import { db, createNotification } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — faculty sees own requests; admin/ops sees all for university
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    if (locals.user.role === 'FACULTY') {
        const profileRes = await db.query(
            `SELECT id FROM faculty_profiles WHERE user_id = $1 LIMIT 1`,
            [locals.user.id]
        );
        if (!profileRes.rows[0]) return json([]);

        const result = await db.query(
            `SELECT id, leave_date, leave_end_date, total_days, leave_type, reason, approval_status, created_at
             FROM faculty_leave_requests
             WHERE faculty_profile_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [profileRes.rows[0].id]
        );
        return json(result.rows);
    }

    if (locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS') {
        const universityId = url.searchParams.get('universityId') || locals.user.university_id;
        if (!universityId) throw error(400, 'universityId required');

        const status = url.searchParams.get('status');
        const result = await db.query(
            `SELECT flr.id, flr.leave_date, flr.leave_end_date, flr.total_days,
                    flr.leave_type, flr.reason,
                    flr.approval_status, flr.created_at,
                    fp.id AS faculty_profile_id, fp.employee_code, fp.department, fp.designation,
                    u.full_name AS faculty_name, u.email AS faculty_email
             FROM faculty_leave_requests flr
             JOIN faculty_profiles fp ON fp.id = flr.faculty_profile_id
             JOIN users u ON u.id = fp.user_id
             WHERE fp.university_id = $1
               ${status ? 'AND flr.approval_status = $2' : ''}
             ORDER BY
               CASE WHEN flr.approval_status = 'PENDING' THEN 0 ELSE 1 END,
               flr.created_at DESC`,
            status ? [universityId, status] : [universityId]
        );
        return json(result.rows);
    }

    throw error(403, 'Forbidden');
};

// POST — faculty submits a leave request (with date range + admin notifications)
export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user?.role !== 'FACULTY') throw error(403, 'Only faculty can submit leave requests');

    const { leave_date, leave_end_date, leave_type, reason } = await request.json();
    if (!leave_date || !leave_type) throw error(400, 'leave_date and leave_type are required');

    // Validate range
    const endDate = leave_end_date || leave_date;
    if (new Date(endDate) < new Date(leave_date)) throw error(400, 'End date cannot be before start date');

    const profileRes = await db.query(
        `SELECT fp.id, fp.university_id, fp.department, fp.designation, u.full_name
         FROM faculty_profiles fp
         JOIN users u ON u.id = fp.user_id
         WHERE fp.user_id = $1 LIMIT 1`,
        [locals.user.id]
    );
    if (!profileRes.rows[0]) throw error(404, 'Faculty profile not found. Contact your admin.');

    const profile = profileRes.rows[0];

    const result = await db.query(
        `INSERT INTO faculty_leave_requests (faculty_profile_id, leave_date, leave_end_date, leave_type, reason, approval_status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING id, leave_date, leave_end_date, total_days, leave_type, reason, approval_status, created_at`,
        [profile.id, leave_date, endDate, leave_type, reason ?? '']
    );

    const leaveRequest = result.rows[0];

    // Notify all ADMIN and PROGRAM_OPS users for this university
    try {
        const admins = await db.query(
            `SELECT id FROM users WHERE role IN ('ADMIN', 'PROGRAM_OPS') AND university_id = $1 AND is_active = true`,
            [profile.university_id]
        );

        const days = leaveRequest.total_days;
        const dateRange = days > 1
            ? `${new Date(leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : new Date(leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        for (const admin of admins.rows) {
            await createNotification({
                user_id: admin.id,
                university_id: profile.university_id,
                title: `Leave Request — ${profile.full_name}`,
                message: `${leave_type} leave for ${dateRange} (${days} day${days > 1 ? 's' : ''})${reason ? ': ' + reason : ''}`,
                type: 'SYSTEM',
                link: '/academic-operations/faculty-ops/leave',
                source_id: `LEAVE_${leaveRequest.id}`
            }).catch(() => {}); // Non-fatal
        }
    } catch { /* Notifications are non-fatal */ }

    return json(leaveRequest, { status: 201 });
};
