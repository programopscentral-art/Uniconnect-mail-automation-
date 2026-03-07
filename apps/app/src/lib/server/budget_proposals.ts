import { db, createNotification, getUserFcmTokens, type BudgetProposal, type BudgetProposalStatus } from '@uniconnect/shared';
import admin from './firebase-admin';
import { addNotificationJob } from './queue';

export async function notifyBudgetProposalUpdate(proposal: BudgetProposal, toStatus: BudgetProposalStatus, actorName: string, reason?: string) {
    const { university_id, id: proposalId, title, proposer_user_id, proposer_email, proposer_name } = proposal;

    let titleText = '';
    let bodyText = '';
    let recipients: { id: string, email: string }[] = [];
    let isToSET = false;

    switch (toStatus) {
        case 'SUBMITTED':
            titleText = 'New Budget Proposal Submitted 📥';
            bodyText = `${actorName} submitted a new budget proposal for "${title}". Review is required.`;
            isToSET = true;
            break;
        case 'REPORT_SUBMITTED':
            titleText = 'Post-Event Report Submitted 📋';
            bodyText = `${actorName} submitted the post-event report for "${title}". Please review the outcomes and bills.`;
            isToSET = true;
            break;
        case 'CHANGES_REQUESTED':
            titleText = 'Changes Requested - Budget Proposal 🔄';
            bodyText = `Reviewers have requested changes for your proposal: ${title}.${reason ? `\n\nReason: ${reason}` : ''}`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'APPROVED':
            titleText = 'Budget Proposal APPROVED ✅';
            bodyText = `Congratulations! Your budget proposal for "${title}" has been approved. You can proceed with the event.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'REJECTED':
            titleText = 'Budget Proposal Rejected ❌';
            bodyText = `Your budget proposal for "${title}" was not approved.${reason ? `\n\nReason: ${reason}` : ''}`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'CLOSED':
            titleText = 'Budget Proposal Finalized';
            bodyText = `The report for "${title}" has been reviewed. The proposal is now officially closed.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'EVENT_COMPLETED':
            titleText = 'Event Over - Report Due';
            bodyText = `Your event "${title}" has concluded according to the schedule. Please upload your report and bills now.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
    }

    if (isToSET) {
        // "Main Mails" - Only Admins and Program Ops as per user request (removing SET/University Operators)
        const setRes = await db.query(
            `SELECT DISTINCT id, email 
             FROM users 
             WHERE (role IN ('ADMIN', 'PROGRAM_OPS') OR email = 'karthikeya.a054@gmail.com' OR email = 'programopscentral@nxtwave.in')
             AND is_active = true`
        );
        recipients = setRes.rows;
    }

    const sourceId = `BP_${proposalId}_${toStatus}`;
    const link = `/budget-proposals/${proposalId}`;

    for (const recipient of recipients) {
        // 1. In-App Notification
        await createNotification({
            user_id: recipient.id,
            university_id,
            title: titleText,
            message: bodyText,
            type: 'SYSTEM',
            link,
            source_id: sourceId
        });

        // 2. Push Notification
        const tokens = await getUserFcmTokens(recipient.id);
        if (tokens.length > 0 && admin.apps.length > 0) {
            try {
                await admin.messaging().sendEachForMulticast({
                    notification: { title: titleText, body: bodyText },
                    data: {
                        type: 'BUDGET_PROPOSAL',
                        proposal_id: proposalId,
                        status: toStatus,
                        university_id,
                        action: 'OPEN_PROPOSAL'
                    },
                    tokens: [...new Set(tokens)],
                    webpush: {
                        fcmOptions: { link }
                    }
                });
            } catch (err) {
                console.error(`[BP_PUSH_ERROR] Failed for ${recipient.email}:`, err);
            }
        }

        // 3. Email Notification (for critical status changes)
        if (['SUBMITTED', 'APPROVED_L1', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'REPORT_SUBMITTED'].includes(toStatus)) {
            await addNotificationJob({
                to: recipient.email,
                subject: titleText,
                text: `Hello,\n\n${bodyText}\n\nView details here: ${process.env.PUBLIC_BASE_URL || ''}${link}`,
                html: `<div>
                    <h2>Budget Proposal Update</h2>
                    <p>${bodyText}</p>
                    <a href="${process.env.PUBLIC_BASE_URL || ''}${link}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">View Proposal Details</a>
                </div>`
            });

            // Log the email trigger in Budget Proposal Email Logs
            try {
                const { logBudgetProposalEmail } = await import('@uniconnect/shared');
                await logBudgetProposalEmail({
                    proposal_id: proposalId,
                    event_type: toStatus,
                    recipient_email: recipient.email,
                    status: 'SENT'
                });
            } catch (err) {
                console.error('[BP_EMAIL_LOG_ERROR]', err);
            }
        }
    }
}
