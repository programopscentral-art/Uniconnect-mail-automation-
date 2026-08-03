/**
 * POST /api/assessments/papers/[id]/approval
 *   body { action: 'send' | 'approve' | 'request_changes' }
 *
 * - 'send'   (creator/BOA): mark the paper pending_review and email + notify
 *            every active SME to review it.
 * - 'approve'(SME/admin): mark the paper approved; notify the creator.
 * - 'request_changes' (SME/admin): send it back to draft with a note; notify
 *            the creator.
 *
 * SMEs already have edit access to the paper (assessments permission), so they
 * can open, edit and Save it from the review link.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, createNotification, sendEmail } from '@uniconnect/shared';

const REVIEWER_ROLES = ['SME', 'ADMIN', 'PROGRAM_OPS'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    if (!params.id) throw error(400, 'id required');
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const note = String(body.note || '').trim();
    const user = locals.user;

    const { rows } = await db.query(
        `SELECT p.id, p.approval_status, p.sent_for_review_by, p.exam_type, p.semester,
                s.name AS subject_name, u.name AS university_name
           FROM assessment_papers p
           JOIN assessment_subjects s ON s.id = p.subject_id
           JOIN universities u ON u.id = p.university_id
          WHERE p.id = $1`,
        [params.id],
    );
    if (rows.length === 0) throw error(404, 'Paper not found');
    const paper = rows[0];
    const label = `${paper.university_name} · ${paper.subject_name} (${paper.exam_type || 'Exam'}, Sem ${paper.semester ?? '?'})`;
    const link = `/assessments/papers/${params.id}`;

    if (action === 'send') {
        await db.query(
            `UPDATE assessment_papers
                SET approval_status = 'pending_review', sent_for_review_at = now(),
                    sent_for_review_by = $2, reviewed_at = NULL, reviewed_by = NULL, updated_at = now()
              WHERE id = $1`,
            [params.id, user.id],
        );

        const smes = await db.query(
            `SELECT id, email, name FROM users WHERE role = 'SME' AND is_active = true AND email IS NOT NULL AND email <> ''`,
        );
        let notified = 0;
        for (const sme of smes.rows as Array<{ id: string; email: string; name: string }>) {
            await createNotification({
                user_id: sme.id,
                title: 'Exam paper ready for review',
                message: `${label} paper is ready. Please review and edit if needed.`,
                type: 'SYSTEM',
                link,
                source_id: `paper_review_${params.id}`,
            }).catch(() => {});
            const r = await sendEmail({
                to: sme.email,
                subject: `[NIAT Exam] Paper ready for review — ${paper.university_name} · ${paper.subject_name}`,
                intro: 'Exam paper ready for review',
                bodyHtml: `<p>Hi ${sme.name || 'there'},</p>
                    <p><b>${label}</b> has been completed by ${user.name || user.email} and is ready for your review.</p>
                    <p>Open it to review, make any edits, and save. You have full edit access.</p>`,
                ctaLabel: 'Review the paper',
                ctaUrl: link,
                tone: 'info',
            }).catch(() => ({ sent: false }));
            if (r?.sent) notified++;
        }
        return json({ ok: true, approval_status: 'pending_review', sme_count: smes.rows.length, emailed: notified });
    }

    if (action === 'approve' || action === 'request_changes') {
        if (!REVIEWER_ROLES.includes(user.role as string)) {
            throw error(403, 'Only SME / Admin can approve or request changes.');
        }
        const approved = action === 'approve';
        await db.query(
            `UPDATE assessment_papers
                SET approval_status = $2, reviewed_at = now(), reviewed_by = $3, updated_at = now()
              WHERE id = $1`,
            [params.id, approved ? 'approved' : 'draft', user.id],
        );
        // Notify the person who sent it for review.
        if (paper.sent_for_review_by) {
            await createNotification({
                user_id: paper.sent_for_review_by,
                title: approved ? 'Paper approved' : 'Paper needs changes',
                message: approved
                    ? `${label} was approved by ${user.name || 'SME'}.`
                    : `${label} needs changes${note ? `: ${note}` : ''}. Reviewed by ${user.name || 'SME'}.`,
                type: 'SYSTEM',
                link,
                source_id: `paper_review_${params.id}`,
            }).catch(() => {});
        }
        return json({ ok: true, approval_status: approved ? 'approved' : 'draft' });
    }

    throw error(400, "action must be 'send', 'approve' or 'request_changes'");
};
