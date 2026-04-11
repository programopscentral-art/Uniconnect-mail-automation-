import { db, createNotification, getUserFcmTokens, type BudgetProposal, type BudgetProposalStatus } from '@uniconnect/shared';
import admin from './firebase-admin';
import { addNotificationJob } from './queue';

export async function notifyBudgetProposalUpdate(proposal: BudgetProposal, toStatus: BudgetProposalStatus, actorName: string, reason?: string) {
    const { university_id, id: proposalId, title, proposer_user_id, proposer_email, proposer_name } = proposal;
    console.log(`[BP_NOTIFY] 📢 Notifying status ${toStatus} for proposal ${proposalId}. Proposer: ${proposer_email}`);

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
        case 'APPROVED_L1':
            titleText = 'Budget Proposal — L1 Approved ✅';
            bodyText = `${actorName} has given L1 approval for "${title}". Final admin approval is now required to proceed.`;
            isToSET = true; // notify admins to give final approval
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
        // "Main Mails" - Explicitly requested by user + Admins/Ops
        const setRes = await db.query(
            `SELECT DISTINCT id, email 
             FROM users 
             WHERE (role IN ('ADMIN', 'PROGRAM_OPS') OR email IN ('programopscentral@nxtwave.in', 'karthikeya.a054@gmail.com', 'pavan.dharma@nxtwave.tech', 'pravalika.s@nxtwave.co.in'))
             AND is_active = true`
        );
        recipients = setRes.rows;

        // Ensure specifically requested stakeholders are ALWAYS included if they are not in the query result
        const stakeholderEmails = ['pavan.dharma@nxtwave.tech', 'pravalika.s@nxtwave.co.in'];
        for (const email of stakeholderEmails) {
            if (!recipients.some(r => r.email === email)) {
                // If not found as active users, add them manually for Email only (dummy ID for notify/push)
                recipients.push({ id: 'STAKEHOLDER_' + Math.random().toString(36).substr(2, 9), email });
            }
        }

        // For SUBMITTED and REPORT_SUBMITTED, also notify the proposer themselves as confirmation
        if ((toStatus === 'SUBMITTED' || toStatus === 'REPORT_SUBMITTED') && !recipients.some(r => r.id === proposer_user_id)) {
            recipients.push({ id: proposer_user_id, email: proposer_email });
        }

        if (recipients.length === 0) {
            console.warn(`[BP_NOTIFY] ⚠️ No recipients found for status ${toStatus}`);
        } else {
            console.log(`[BP_NOTIFY] 👥 Found ${recipients.length} recipients: ${recipients.map(r => r.email).join(', ')}`);
        }
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
            const baseUrl = process.env.PUBLIC_BASE_URL || '';
            console.log(`[BP_NOTIFY] 📬 Queueing email for ${recipient.email}. Base URL: ${baseUrl}`);
            await addNotificationJob({
                to: recipient.email,
                subject: titleText,
                text: `Hello,\n\n${bodyText}\n\nView details here: ${baseUrl}${link}`,
                html: `<div>
                    <h2>Budget Proposal Update</h2>
                    <p>${bodyText}</p>
                    <a href="${baseUrl}${link}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">View Proposal Details</a>
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
