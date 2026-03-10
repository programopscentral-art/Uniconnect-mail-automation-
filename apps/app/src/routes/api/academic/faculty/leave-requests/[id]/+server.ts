import { db, createNotification } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';

// GET /api/academic/faculty/leave-requests/[id]/substitutes
// Returns faculty who can substitute for the leave requester's subjects

// PATCH — admin approves/rejects + optionally assigns substitute
export const PATCH = async ({ params, request, locals }: { params: { id: string }; request: Request; locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { approval_status, substitute_faculty_profile_id } = await request.json();
    if (!['APPROVED', 'REJECTED'].includes(approval_status)) {
        throw error(400, 'approval_status must be APPROVED or REJECTED');
    }

    const result = await db.query(
        `UPDATE faculty_leave_requests
         SET approval_status = $1,
             substitute_faculty_profile_id = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, approval_status, substitute_faculty_profile_id,
                   leave_date, leave_end_date, total_days, leave_type, faculty_profile_id`,
        [approval_status, substitute_faculty_profile_id || null, params.id]
    );

    if (!result.rows[0]) throw error(404, 'Leave request not found');
    const req = result.rows[0];

    // Notify the faculty member of the decision
    try {
        const facultyUserRes = await db.query(
            `SELECT u.id, u.full_name, fp.university_id
             FROM faculty_profiles fp JOIN users u ON u.id = fp.user_id
             WHERE fp.id = $1 LIMIT 1`,
            [req.faculty_profile_id]
        );
        if (facultyUserRes.rows[0]) {
            const f = facultyUserRes.rows[0];
            const days = req.total_days ?? 1;
            const dateStr = days > 1
                ? `${new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(req.leave_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            await createNotification({
                user_id: f.id,
                university_id: f.university_id,
                title: `Leave ${approval_status === 'APPROVED' ? 'Approved' : 'Rejected'} — ${req.leave_type}`,
                message: `Your ${req.leave_type} leave request for ${dateStr} has been ${approval_status.toLowerCase()}.`,
                type: 'SYSTEM',
                link: '/faculty-portal/dashboard',
                source_id: `LEAVE_DECISION_${req.id}`
            }).catch(() => {});

            // If a substitute was assigned, notify them too
            if (approval_status === 'APPROVED' && substitute_faculty_profile_id) {
                const subUserRes = await db.query(
                    `SELECT u.id FROM faculty_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.id = $1 LIMIT 1`,
                    [substitute_faculty_profile_id]
                );
                if (subUserRes.rows[0]) {
                    await createNotification({
                        user_id: subUserRes.rows[0].id,
                        university_id: f.university_id,
                        title: `Substitute Assignment — ${f.full_name}`,
                        message: `You have been assigned as substitute for ${f.full_name}'s ${req.leave_type} leave on ${dateStr}.`,
                        type: 'SYSTEM',
                        link: '/faculty-portal/dashboard',
                        source_id: `SUBSTITUTE_${req.id}`
                    }).catch(() => {});
                }
            }
        }
    } catch { /* non-fatal */ }

    return json(result.rows[0]);
};
