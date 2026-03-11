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
    } catch { _migrated = true; }
}

// PATCH — admin approves/rejects + optionally assigns substitute
export const PATCH = async ({ params, request, locals }: { params: { id: string }; request: Request; locals: App.Locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS', 'COS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }
    await ensureColumns();

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

    // Notify the faculty member of the decision + FCM push
    try {
        const facultyUserRes = await db.query(
            `SELECT u.id, u.name, fp.university_id
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

            const decisionTitle = `Leave ${approval_status === 'APPROVED' ? 'Approved' : 'Rejected'} — ${req.leave_type}`;
            const decisionMsg = `Your ${req.leave_type} leave request for ${dateStr} has been ${approval_status.toLowerCase()}.`;
            const decisionSourceId = `LEAVE_DECISION_${req.id}`;

            await createNotification({
                user_id: f.id,
                university_id: f.university_id,
                title: decisionTitle,
                message: decisionMsg,
                type: 'SYSTEM',
                link: '/faculty-portal/dashboard',
                source_id: decisionSourceId
            }).catch(() => {});

            // FCM push to faculty
            try {
                const tokens = await getUserFcmTokens(f.id);
                if (tokens.length > 0 && admin.apps.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: { title: decisionTitle, body: decisionMsg },
                        data: { type: 'SYSTEM', sourceId: decisionSourceId, link: '/faculty-portal/dashboard' },
                        tokens: [...new Set(tokens)]
                    }).catch(() => {});
                }
            } catch { /* non-fatal */ }

            // If a substitute was assigned, notify them too
            if (approval_status === 'APPROVED' && substitute_faculty_profile_id) {
                const subUserRes = await db.query(
                    `SELECT u.id FROM faculty_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.id = $1 LIMIT 1`,
                    [substitute_faculty_profile_id]
                );
                if (subUserRes.rows[0]) {
                    const subTitle = `Substitute Assignment — ${f.name}`;
                    const subMsg = `You have been assigned as substitute for ${f.name}'s ${req.leave_type} leave on ${dateStr}.`;
                    const subSourceId = `SUBSTITUTE_${req.id}`;

                    await createNotification({
                        user_id: subUserRes.rows[0].id,
                        university_id: f.university_id,
                        title: subTitle,
                        message: subMsg,
                        type: 'SYSTEM',
                        link: '/faculty-portal/dashboard',
                        source_id: subSourceId
                    }).catch(() => {});

                    // FCM push to substitute
                    try {
                        const subTokens = await getUserFcmTokens(subUserRes.rows[0].id);
                        if (subTokens.length > 0 && admin.apps.length > 0) {
                            await admin.messaging().sendEachForMulticast({
                                notification: { title: subTitle, body: subMsg },
                                data: { type: 'SYSTEM', sourceId: subSourceId, link: '/faculty-portal/dashboard' },
                                tokens: [...new Set(subTokens)]
                            }).catch(() => {});
                        }
                    } catch { /* non-fatal */ }
                }
            }
        }
    } catch { /* non-fatal */ }

    return json(result.rows[0]);
};
