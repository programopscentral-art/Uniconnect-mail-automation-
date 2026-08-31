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

// Configured facilities finance contacts.
//  - Approvers ("main managers for facilities") always get the approval request.
//  - The disburser gets the "ready to disburse" mail once a request is approved.
const PC_APPROVER_EMAILS = ['programopscentral@nxtwave.in', 'satish.jada@nxtwave.co.in'];
const PC_DISBURSER = { id: '', email: 'manda.sasikanth@nxtwave.co.in', name: 'Sasi' };

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
            // Always include the configured facilities managers (Satish + Program Ops),
            // even if their role isn't a finance role. Resolve them to real user
            // records so the email greets them by name (and notifies them in-app).
            const managers = (await db.query(
                `SELECT id, email, name FROM users WHERE email = ANY($1) AND is_active = true`,
                [PC_APPROVER_EMAILS],
            )).rows as Target[];
            for (const m of managers) {
                if (!recipients.some((r) => r.email === m.email)) recipients.push(m);
            }
            // Any configured email that isn't a user yet → email-only fallback.
            for (const e of PC_APPROVER_EMAILS) {
                if (!recipients.some((r) => r.email === e)) recipients.push({ id: '', email: e });
            }
            break;
        }
        case 'APPROVED': {
            title = 'Petty cash approved ✅';
            body = `Your request ${label} was approved by ${actorName}. Finance will disburse shortly.`;
            recipients = [{ id: req.requester_user_id, email: req.requester_email, name: req.requester_name }];
            // The disburse handoff email (to Sasi + facilities) is sent below.
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

    // Disburse handoff: once (and only once) a request is APPROVED, the disburser
    // (Sasi) + any facilities users are told they can now pay out the money.
    if (toStatus === 'APPROVED') {
        const who = req.requester_name || req.requester_email;
        const amount = money(req.amount_approved || req.amount_requested);
        const dTitle = `Ready to disburse — pay ${who}`;
        const dBody = `${req.request_no || 'This petty cash request'} · ${req.purpose} (${amount}) has been approved by ${actorName}. You can now hand over ${amount} to ${who} and record the payment in UniConnect.`;

        const facUsers = await usersWithRoles(req.university_id, ['FACILITIES']);
        const targets: Target[] = [PC_DISBURSER, ...facUsers.map((f) => ({ id: f.id, email: f.email, name: f.name }))]
            .filter((t, i, arr) => arr.findIndex((x) => x.email === t.email) === i);

        for (const t of targets) {
            if (t.id) {
                await createNotification({
                    user_id: t.id, university_id: req.university_id,
                    title: 'Ready to disburse', message: dBody, type: 'SYSTEM', link,
                    source_id: `PC_${req.id}_DISBURSE_READY`,
                }).catch(() => {});
            }
            if (t.email) {
                await sendEmail({
                    to: t.email,
                    subject: `[Petty Cash] Ready to disburse — ${req.request_no || ''}`,
                    intro: dTitle,
                    bodyHtml: buildPettyCashEmail({ recipientName: t.name, title: dTitle, message: dBody, req, toStatus: 'APPROVED', ctaUrl }),
                    wrap: false,
                }).catch(() => ({ sent: false }));
            }
        }
    }
}
