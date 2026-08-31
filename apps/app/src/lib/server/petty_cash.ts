import { db, createNotification, sendEmail, type PettyCashRequest, type PettyCashStatus } from '@uniconnect/shared';
import { buildPettyCashEmail } from './petty_cash_email';

/**
 * Petty-cash lifecycle notifications.
 *
 * Follows the design's notification matrix: push/email for things that block
 * someone or carry a deadline; in-app for confirmations. (Deadline reminders
 * are a scheduled worker job — not fired here.)
 */

const APPROVER_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS'];
const FINANCE_ROLES = ['CMA_MANAGER', 'ADMIN', 'PROGRAM_OPS', 'FACILITIES'];

async function usersWithRoles(universityId: string, roles: string[]): Promise<Array<{ id: string; email: string; name: string }>> {
    // University-scoped users in the given roles + global admins/ops.
    const { rows } = await db.query(
        `SELECT DISTINCT u.id, u.email, u.name
           FROM users u
           LEFT JOIN user_universities uu ON uu.user_id = u.id
          WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
            AND u.role = ANY($1)
            AND (u.role IN ('ADMIN','PROGRAM_OPS') OR uu.university_id = $2 OR u.university_id = $2)`,
        [roles, universityId],
    );
    return rows;
}
const approversFor = (universityId: string) => usersWithRoles(universityId, APPROVER_ROLES);
const financeFor = (universityId: string) => usersWithRoles(universityId, FINANCE_ROLES);

const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

export async function notifyPettyCashUpdate(
    req: PettyCashRequest,
    toStatus: PettyCashStatus,
    actorName: string,
    note?: string,
) {
    const baseUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
    const link = `/petty-cash/${req.id}`;
    const ctaUrl = `${baseUrl}${link}`;
    const label = `${req.request_no || 'Petty cash'} · ${req.purpose} (${money(req.amount_requested)})`;
    const source_id = `PC_${req.id}_${toStatus}`;

    type Target = { id: string; email?: string; name?: string };
    let title = '';
    let body = '';
    let recipients: Target[] = [];
    let email = true;

    switch (toStatus) {
        case 'SUBMITTED': {
            title = 'Petty cash request needs your approval 🔔';
            body = `${actorName} submitted ${label}. Please approve, send back, or reject.`;
            recipients = await approversFor(req.university_id);
            break;
        }
        case 'APPROVED': {
            title = 'Petty cash approved ✅';
            body = `Your request ${label} was approved by ${actorName}. Finance will disburse shortly.`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            // Also nudge the finance/facilities team (in-app only) — they disburse.
            const finance = await financeFor(req.university_id);
            for (const f of finance) {
                await createNotification({ user_id: f.id, university_id: req.university_id,
                    title: 'Petty cash ready to disburse', message: `${label} is approved and awaiting payment.`,
                    type: 'SYSTEM', link, source_id: `PC_${req.id}_DISBURSE_QUEUE` }).catch(() => {});
            }
            break;
        }
        case 'SENT_BACK': {
            title = 'Petty cash sent back for changes 🔄';
            body = `${actorName} asked for changes on ${label}.${note ? ` Note: ${note}` : ''}`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            break;
        }
        case 'REJECTED': {
            title = 'Petty cash request rejected ❌';
            body = `${label} was rejected by ${actorName}.${note ? ` Reason: ${note}` : ''}`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            break;
        }
        case 'DISBURSED': {
            title = 'Petty cash disbursed 💸';
            body = `${money(req.total_paid || req.amount_approved || req.amount_requested)} for ${label} has been paid out.` +
                (req.bill_due_on ? ` Please submit the bill by ${new Date(req.bill_due_on).toLocaleDateString('en-IN')}.` : ' Please submit the bill.');
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            break;
        }
        case 'BILL_VERIFIED': {
            title = 'Petty cash bill verified ✅';
            body = `Your bill for ${label} was verified by ${actorName}. Settlement is next.`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            email = false; // confirmation → in-app only
            break;
        }
        case 'SETTLED':
        case 'CLOSED': {
            title = 'Petty cash settled ✔️';
            body = `${label} is settled and closed. Thank you.`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            email = false; // quiet close → in-app only
            break;
        }
        default:
            return;
    }

    for (const r of recipients) {
        if (r.id) {
            await createNotification({
                user_id: r.id, university_id: req.university_id,
                title, message: body, type: 'SYSTEM', link, source_id,
            }).catch(() => {});
        }
        if (email && r.email) {
            const html = buildPettyCashEmail({
                recipientName: r.name,
                title: title.replace(/[🔔✅🔄❌💸✔️]/g, '').trim(),
                message: body,
                req,
                toStatus,
                ctaUrl,
            });
            await sendEmail({
                to: r.email,
                subject: `[Petty Cash] ${title.replace(/[🔔✅🔄❌💸✔️]/g, '').trim()} — ${req.request_no || ''}`,
                intro: title,
                bodyHtml: html,
                wrap: false, // html is a complete, self-contained branded email
            }).catch(() => ({ sent: false }));
        }
    }

    // Facilities/Finance-ops get an immediate heads-up the moment a request is
    // raised — so they can plan the disbursement even before it's approved.
    if (toStatus === 'SUBMITTED') {
        const facilities = await usersWithRoles(req.university_id, ['FACILITIES']);
        const facTitle = 'New petty cash request raised';
        const facBody = `${req.requester_name || req.requester_email} raised ${label}. It is awaiting approval — you'll be able to disburse once it's approved.`;
        for (const f of facilities) {
            await createNotification({
                user_id: f.id, university_id: req.university_id,
                title: facTitle, message: facBody, type: 'SYSTEM', link,
                source_id: `PC_${req.id}_FACILITIES_NEW`,
            }).catch(() => {});
            if (f.email) {
                await sendEmail({
                    to: f.email,
                    subject: `[Petty Cash] New request raised — ${req.request_no || ''}`,
                    intro: facTitle,
                    bodyHtml: buildPettyCashEmail({ recipientName: f.name, title: facTitle, message: facBody, req, toStatus: 'SUBMITTED', ctaUrl }),
                    wrap: false,
                }).catch(() => ({ sent: false }));
            }
        }
    }
}
