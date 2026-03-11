import { db, createNotification, getUserFcmTokens } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import admin from '$lib/server/firebase-admin';

// Ensure the leave_requests table has all needed columns
let _migrated = false;
async function ensureColumns() {
    if (_migrated) return;
    try {
        await db.query(`
            ALTER TABLE faculty_leave_requests ADD COLUMN IF NOT EXISTS leave_end_date DATE;
            ALTER TABLE faculty_leave_requests ADD COLUMN IF NOT EXISTS total_days INT;
            ALTER TABLE faculty_leave_requests ADD COLUMN IF NOT EXISTS approval_level TEXT;
            ALTER TABLE faculty_leave_requests ADD COLUMN IF NOT EXISTS substitute_faculty_profile_id UUID REFERENCES faculty_profiles(id);
            ALTER TABLE faculty_leave_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        `);
        _migrated = true;
    } catch { /* columns may already exist */ _migrated = true; }
}

// GET — faculty sees own requests; admin/ops sees all for university
export const GET = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureColumns();

    if (locals.user.role === 'FACULTY') {
        const profileRes = await db.query(
            `SELECT id FROM faculty_profiles WHERE user_id = $1 LIMIT 1`,
            [locals.user.id]
        );
        if (!profileRes.rows[0]) return json([]);

        const result = await db.query(
            `SELECT id, leave_date, leave_end_date, total_days, leave_type, reason,
                    approval_status, approval_level, created_at
             FROM faculty_leave_requests
             WHERE faculty_profile_id = $1
             ORDER BY created_at DESC LIMIT 20`,
            [profileRes.rows[0].id]
        );
        return json(result.rows);
    }

    if (['ADMIN', 'PROGRAM_OPS', 'COS'].includes(locals.user.role)) {
        const universityId = url.searchParams.get('universityId') || locals.user.university_id;
        if (!universityId) throw error(400, 'universityId required');

        const status = url.searchParams.get('status');

        // COS only sees CO-level leaves; ADMIN/PROGRAM_OPS see all
        const levelFilter = locals.user.role === 'COS' ? `AND flr.approval_level = 'CO'` : '';

        const result = await db.query(
            `SELECT flr.id, flr.leave_date, flr.leave_end_date, flr.total_days,
                    flr.leave_type, flr.reason, flr.approval_status, flr.approval_level,
                    flr.substitute_faculty_profile_id,
                    flr.created_at,
                    fp.id AS faculty_profile_id, fp.employee_code, fp.department, fp.designation,
                    u.name AS faculty_name, u.email AS faculty_email,
                    su.name AS substitute_name
             FROM faculty_leave_requests flr
             JOIN faculty_profiles fp ON fp.id = flr.faculty_profile_id
             JOIN users u ON u.id = fp.user_id
             LEFT JOIN faculty_profiles sfp ON sfp.id = flr.substitute_faculty_profile_id
             LEFT JOIN users su ON su.id = sfp.user_id
             WHERE fp.university_id = $1
               ${levelFilter}
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

// DELETE — faculty cancels their own pending leave request
export const DELETE = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureColumns();

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'id is required');

    // Only allow faculty to cancel their own pending requests
    const profileRes = await db.query(
        `SELECT id FROM faculty_profiles WHERE user_id = $1 LIMIT 1`,
        [locals.user.id]
    );
    if (!profileRes.rows[0]) throw error(404, 'Faculty profile not found');

    const reqRes = await db.query(
        `SELECT id, approval_status, faculty_profile_id FROM faculty_leave_requests WHERE id = $1`,
        [id]
    );
    if (!reqRes.rows[0]) throw error(404, 'Leave request not found');

    const req = reqRes.rows[0];
    // Faculty can only cancel their own
    if (req.faculty_profile_id !== profileRes.rows[0].id && locals.user.role === 'FACULTY') {
        throw error(403, 'You can only cancel your own leave requests');
    }
    if (req.approval_status !== 'PENDING') {
        throw error(400, 'Only PENDING requests can be cancelled');
    }

    await db.query(`DELETE FROM faculty_leave_requests WHERE id = $1`, [id]);
    return json({ success: true });
};

// POST — faculty submits leave (auto-routes: 1-2 days = CO, 3+ days = CENTRAL)
export const POST = async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (locals.user?.role !== 'FACULTY') throw error(403, 'Only faculty can submit leave requests');
    await ensureColumns();

    const { leave_date, leave_end_date, leave_type, reason } = await request.json();
    if (!leave_date || !leave_type) throw error(400, 'leave_date and leave_type are required');

    const endDate = leave_end_date || leave_date;
    if (new Date(endDate) < new Date(leave_date)) throw error(400, 'End date cannot be before start date');

    const totalDays = Math.round((new Date(endDate).getTime() - new Date(leave_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const approvalLevel = totalDays <= 2 ? 'CO' : 'CENTRAL';

    const profileRes = await db.query(
        `SELECT fp.id, fp.university_id, fp.department, fp.designation, u.name
         FROM faculty_profiles fp
         JOIN users u ON u.id = fp.user_id
         WHERE fp.user_id = $1 LIMIT 1`,
        [locals.user.id]
    );
    if (!profileRes.rows[0]) throw error(404, 'Faculty profile not found. Contact your admin.');

    const profile = profileRes.rows[0];

    const result = await db.query(
        `INSERT INTO faculty_leave_requests
            (faculty_profile_id, leave_date, leave_end_date, leave_type, reason, approval_status, approval_level)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
         RETURNING id, leave_date, leave_end_date, total_days, leave_type, reason, approval_status, approval_level, created_at`,
        [profile.id, leave_date, endDate, leave_type, reason ?? '', approvalLevel]
    );

    const leaveRequest = result.rows[0];
    const days = leaveRequest.total_days ?? totalDays;
    const dateRange = days > 1
        ? `${new Date(leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : new Date(leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const levelLabel = approvalLevel === 'CO' ? 'CO Approval' : 'Central Approval Required';

    // Route notifications based on leave duration:
    // ≤2 days (CO level) → COS + ADMIN
    // >2 days (CENTRAL level) → ADMIN + PROGRAM_OPS (central team)
    const notifTitle = `Leave Request [${levelLabel}] — ${profile.name}`;
    const notifMessage = `${leave_type} leave ${dateRange} (${days} day${days > 1 ? 's' : ''})${reason ? ': ' + reason : ''}`;
    const notifLink = '/academic-operations/faculty-ops/leave';
    const sourceId = `LEAVE_${leaveRequest.id}`;

    const targetRoles = approvalLevel === 'CO'
        ? `('COS', 'ADMIN')`
        : `('ADMIN', 'PROGRAM_OPS')`;

    try {
        const admins = await db.query(
            `SELECT id FROM users WHERE role IN ${targetRoles} AND university_id = $1 AND is_active = true`,
            [profile.university_id]
        );

        const allFcmTokens: string[] = [];

        for (const adm of admins.rows) {
            await createNotification({
                user_id: adm.id,
                university_id: profile.university_id,
                title: notifTitle,
                message: notifMessage,
                type: 'SYSTEM',
                link: notifLink,
                source_id: sourceId
            }).catch(() => {});

            // Collect FCM tokens for push
            try {
                const tokens = await getUserFcmTokens(adm.id);
                allFcmTokens.push(...tokens);
            } catch { /* non-fatal */ }
        }

        // Send FCM push for immediate delivery
        if (allFcmTokens.length > 0 && admin.apps.length > 0) {
            await admin.messaging().sendEachForMulticast({
                notification: { title: notifTitle, body: notifMessage },
                data: { type: 'SYSTEM', sourceId, link: notifLink },
                tokens: [...new Set(allFcmTokens)]
            }).catch(() => {});
        }
    } catch { /* non-fatal */ }

    return json(leaveRequest, { status: 201 });
};
