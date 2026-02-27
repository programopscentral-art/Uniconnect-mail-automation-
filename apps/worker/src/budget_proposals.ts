import { db, getProposalsForCompletion, getProposalsForReportingReminders, type BudgetProposal, getUserFcmTokens, createNotification } from '@uniconnect/shared';
import * as admin from 'firebase-admin';

export async function processBudgetProposalsWorker() {
    console.log('[BUDGET-WORKER] 🕒 Running budget modular checks...');

    try {
        // 1. Mark Event Completed
        const toComplete = await getProposalsForCompletion();
        for (const proposal of toComplete) {
            console.log(`[BUDGET-WORKER] 🏁 Event passing: ${proposal.title} (${proposal.id})`);

            await db.query(`UPDATE budget_proposals SET status = 'EVENT_COMPLETED', updated_at = NOW(), version = version + 1 WHERE id = $1`, [proposal.id]);

            await db.query(`
                INSERT INTO budget_proposal_audit_log (proposal_id, action, from_status, to_status, actor_name)
                VALUES ($1, 'STATUS_CHANGE', 'APPROVED', 'EVENT_COMPLETED', 'SYSTEM')
            `, [proposal.id]);

            // Notify Proposer
            const title = 'Event Completed - Submit Report';
            const body = `Your event "${proposal.title}" is over. Please submit your post-event report now.`;
            const link = `/budget-proposals/${proposal.id}`;

            await createNotification({
                user_id: proposal.proposer_user_id,
                university_id: proposal.university_id,
                title,
                message: body,
                type: 'SYSTEM',
                link,
                source_id: `BP_${proposal.id}_EVENT_COMPLETED_AUTO`
            });

            const tokens = await getUserFcmTokens(proposal.proposer_user_id);
            if (tokens.length > 0 && admin.apps.length > 0) {
                await admin.messaging().sendEachForMulticast({
                    notification: { title, body },
                    data: { type: 'BUDGET_PROPOSAL', proposal_id: proposal.id, action: 'OPEN_REPORT' },
                    tokens: [...new Set(tokens)],
                    webpush: { fcmOptions: { link } }
                });
            }
        }

        // 2. Report Reminders (Every 48 hours after completion)
        const toRemind = await getProposalsForReportingReminders();
        for (const proposal of toRemind) {
            console.log(`[BUDGET-WORKER] ⏰ Sending report reminder for: ${proposal.title}`);

            const title = 'REMINDER: Submit Post-Event Report';
            const body = `It's been 48 hours since your event "${proposal.title}". Please submit the report to close the budget.`;
            const link = `/budget-proposals/${proposal.id}`;

            await createNotification({
                user_id: proposal.proposer_user_id,
                university_id: proposal.university_id,
                title,
                message: body,
                type: 'SYSTEM',
                link,
                source_id: `BP_${proposal.id}_REPORT_REMINDER_${new Date().toISOString().split('T')[0]}`
            });

            await db.query(`
                INSERT INTO budget_proposal_audit_log (proposal_id, action, actor_name)
                VALUES ($1, 'REPORT_REMINDER_SENT', 'SYSTEM')
            `, [proposal.id]);

            const tokens = await getUserFcmTokens(proposal.proposer_user_id);
            if (tokens.length > 0 && admin.apps.length > 0) {
                await admin.messaging().sendEachForMulticast({
                    notification: { title, body },
                    data: { type: 'BUDGET_PROPOSAL', proposal_id: proposal.id, action: 'OPEN_REPORT' },
                    tokens: [...new Set(tokens)],
                    webpush: { fcmOptions: { link } }
                });
            }
        }

    } catch (err) {
        console.error('[BUDGET-WORKER] ❌ Error in budget worker cycle:', err);
    }
}
