import { db, createNotification, getUserFcmTokens, type BudgetProposal, type BudgetProposalStatus } from '@uniconnect/shared';
import admin from './firebase-admin';
import { addNotificationJob } from './queue';

export async function notifyBudgetProposalUpdate(proposal: BudgetProposal, toStatus: BudgetProposalStatus, actorName: string) {
    const { university_id, id: proposalId, title, proposer_user_id, proposer_email, proposer_name } = proposal;

    let titleText = '';
    let bodyText = '';
    let recipients: { id: string, email: string }[] = [];
    let isToSET = false;

    switch (toStatus) {
        case 'SUBMITTED':
            titleText = 'New Budget Proposal Submitted';
            bodyText = `${actorName} submitted a new budget proposal: ${title}`;
            isToSET = true;
            break;
        case 'APPROVED_L1':
            titleText = 'Budget Proposal Approved (L1)';
            bodyText = `${actorName} performed L1 approval for: ${title}. Final approval pending.`;
            isToSET = true; // Still "ToSET" but actually for Higher-ups if we use the same pool, or filter it.
            break;
        case 'REPORT_SUBMITTED':
            titleText = 'Post-Event Report Submitted';
            bodyText = `${actorName} submitted the post-event report for: ${title}`;
            isToSET = true;
            break;
        case 'CHANGES_REQUESTED':
            titleText = 'Changes Requested on Budget Proposal';
            bodyText = `SET has requested changes for: ${title}`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'APPROVED':
            titleText = 'Budget Proposal APPROVED ✅';
            bodyText = `Your budget proposal for ${title} has been approved.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'REJECTED':
            titleText = 'Budget Proposal Rejected ❌';
            bodyText = `Your budget proposal for ${title} was not approved.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'CLOSED':
            titleText = 'Budget Proposal Closed';
            bodyText = `Your budget proposal for ${title} has been finalized and closed.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
        case 'EVENT_COMPLETED':
            titleText = 'Event Completed - Action Required';
            bodyText = `Your event ${title} has passed. Please submit the post-event report.`;
            recipients = [{ id: proposer_user_id, email: proposer_email }];
            break;
    }

    if (isToSET) {
        // Find SET Reviewers for this university
        const setRes = await db.query(
            `SELECT DISTINCT u.id, u.email 
             FROM users u
             LEFT JOIN user_universities uu ON u.id = uu.user_id
             WHERE (u.role IN ('SET_REVIEWER', 'ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR'))
             AND (u.university_id = $1 OR uu.university_id = $1 OR u.role IN ('ADMIN', 'PROGRAM_OPS'))
             AND u.is_active = true`,
            [university_id]
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
        if (['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(toStatus)) {
            await addNotificationJob({
                to: recipient.email,
                subject: titleText,
                text: `Hi ${proposer_name || 'there'},\n\n${bodyText}\n\nView details here: ${process.env.PUBLIC_BASE_URL || ''}${link}`,
                html: `<div>
                    <h2>${titleText}</h2>
                    <p>${bodyText}</p>
                    <a href="${process.env.PUBLIC_BASE_URL || ''}${link}">View Proposal</a>
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
