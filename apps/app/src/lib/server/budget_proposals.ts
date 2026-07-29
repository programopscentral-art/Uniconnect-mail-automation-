import { db, createNotification, getUserFcmTokens, type BudgetProposal, type BudgetItem, type BudgetProposalStatus } from '@uniconnect/shared';
import admin from './firebase-admin';
import { addNotificationJob } from './queue';

type FullProposal = BudgetProposal & {
    university_name?: string;
    items?: BudgetItem[];
    attachments?: any[];
    report?: any;
};

const PRIORITY_COLOR: Record<string, string> = { HIGH: '#DC2626', MED: '#D97706', LOW: '#16A34A' };
const STATUS_COLOR: Record<string, string> = {
    SUBMITTED: '#2563EB', UNDER_REVIEW: '#7C3AED', CHANGES_REQUESTED: '#D97706',
    APPROVED_L1: '#0D9488', APPROVED: '#16A34A', REJECTED: '#DC2626',
    REPORT_SUBMITTED: '#2563EB', CLOSED: '#374151'
};
const STATUS_LABEL: Record<string, string> = {
    SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', CHANGES_REQUESTED: 'Changes Requested',
    APPROVED_L1: 'L1 Approved — Awaiting Final', APPROVED: 'Approved ✅', REJECTED: 'Rejected',
    REPORT_SUBMITTED: 'Report Submitted', CLOSED: 'Closed', EVENT_COMPLETED: 'Event Completed'
};
const CATEGORY_LABEL: Record<string, string> = {
    VENUE: 'Venue', FOOD: 'Food & Beverages', SPEAKER: 'Speaker / Guest', TRAVEL: 'Travel',
    MARKETING: 'Marketing', AWARDS: 'Awards', RECOGNITION: 'Recognition', HOSPITALITY: 'Hospitality',
    CERTIFICATES: 'Certificates', GIFTS: 'Gifts', MISC: 'Miscellaneous'
};

function fmtINR(n: number) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildBudgetProposalEmail(proposal: FullProposal, bodyText: string, baseUrl: string, proposalId: string): string {
    const viewUrl = `${baseUrl}/api/budget-proposals/${proposalId}/view`;
    const appUrl = `${baseUrl}/budget-proposals/${proposalId}`;
    const budget = Number(proposal.estimated_total_budget) || 0;
    const isL1Under10K = proposal.status === 'APPROVED_L1' && budget < 10000;
    const isL1Over10K = proposal.status === 'APPROVED_L1' && budget >= 10000;

    // Use green for <₹10K approved, amber for ≥₹10K needing admin, default indigo for others
    const headerGradient = isL1Under10K ? 'linear-gradient(135deg,#059669 0%,#10B981 100%)'
        : isL1Over10K ? 'linear-gradient(135deg,#D97706 0%,#F59E0B 100%)'
        : 'linear-gradient(135deg,#1E1B4B 0%,#312E81 100%)';
    const statusColor = STATUS_COLOR[proposal.status] || '#6B7280';
    const priorityColor = PRIORITY_COLOR[proposal.priority] || '#6B7280';
    const statusLabel = isL1Under10K ? 'CMA APPROVED' : isL1Over10K ? 'NEEDS ADMIN APPROVAL' : (STATUS_LABEL[proposal.status] || proposal.status);

    // Mobile-friendly: use 3-column layout (Description combines category, Qty, Amount)
    const itemRows = (proposal.items || []).map(item => `
        <tr>
            <td style="padding:8px 6px;border-bottom:1px solid #F1F5F9;font-size:12px;word-break:break-word;">
                <div style="font-weight:600;color:#374151;">${item.description}</div>
                <div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${CATEGORY_LABEL[item.category] || item.category}${item.unit_cost ? ' · ' + fmtINR(item.unit_cost) + '/unit' : ''}</div>
            </td>
            <td style="padding:8px 4px;border-bottom:1px solid #F1F5F9;font-size:12px;text-align:center;white-space:nowrap;">${item.qty || '—'}</td>
            <td style="padding:8px 6px;border-bottom:1px solid #F1F5F9;font-size:12px;font-weight:700;text-align:right;white-space:nowrap;">${fmtINR(item.amount)}</td>
        </tr>`).join('');

    const itemsSection = (proposal.items || []).length > 0 ? `
        <div style="margin-bottom:24px;">
            <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">💰 Budget Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;table-layout:fixed;">
                <thead>
                    <tr style="background:#F8FAFC;">
                        <th style="padding:8px 6px;font-size:10px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:left;width:60%;">Item</th>
                        <th style="padding:8px 4px;font-size:10px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:center;width:15%;">Qty</th>
                        <th style="padding:8px 6px;font-size:10px;text-transform:uppercase;font-weight:700;color:#6B7280;text-align:right;width:25%;">Amount</th>
                    </tr>
                </thead>
                <tbody>${itemRows}</tbody>
                <tfoot>
                    <tr style="background:#F0FDF4;">
                        <td colspan="2" style="padding:10px 6px;font-size:12px;font-weight:700;text-align:right;border-top:2px solid #16A34A;">Total Estimated Budget</td>
                        <td style="padding:10px 6px;font-size:13px;font-weight:700;color:#16A34A;text-align:right;border-top:2px solid #16A34A;">${fmtINR(proposal.estimated_total_budget)}</td>
                    </tr>
                    ${proposal.approved_total_budget !== null && proposal.approved_total_budget !== undefined ? `
                    <tr style="background:#EFF6FF;">
                        <td colspan="2" style="padding:10px 6px;font-size:12px;font-weight:700;text-align:right;border-top:1px solid #BFDBFE;">Approved Budget</td>
                        <td style="padding:10px 6px;font-size:13px;font-weight:700;color:#2563EB;text-align:right;border-top:1px solid #BFDBFE;">${fmtINR(proposal.approved_total_budget)}</td>
                    </tr>` : ''}
                </tfoot>
            </table>
        </div>` : '';

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:680px;margin:24px auto;">

    <!-- Header -->
    <div style="background:${headerGradient};border-radius:12px 12px 0 0;padding:28px 32px;color:white;">
        <div style="font-size:11px;font-weight:600;opacity:0.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Budget Proposal Update</div>
        <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;line-height:1.3;">${proposal.title}</h1>
        <div style="font-size:13px;opacity:0.8;">${(proposal as any).university_name || ''} &nbsp;·&nbsp; ${(proposal.event_type || '').replace(/_/g, ' ')} &nbsp;·&nbsp; ${fmtDate(proposal.proposed_date)}</div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
            <span style="display:inline-block;padding:4px 12px;border-radius:20px;background:${statusColor};font-size:12px;font-weight:700;">${statusLabel}</span>
            <span style="display:inline-block;padding:4px 12px;border-radius:20px;background:${priorityColor};font-size:12px;font-weight:700;">${proposal.priority} Priority</span>
        </div>
    </div>

    <!-- Body -->
    <div style="background:white;padding:28px 32px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">

        <!-- Update message -->
        <div style="background:#EFF6FF;border-left:4px solid #2563EB;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#1E40AF;line-height:1.6;">${bodyText}</p>
        </div>

        <!-- Details grid -->
        <div style="margin-bottom:24px;">
            <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">📋 Proposal Details</h3>
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;width:40%;font-size:13px;color:#6B7280;font-weight:600;">Proposer</td>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:600;">${proposal.proposer_name || proposal.proposer_email} <span style="color:#6B7280;font-weight:400;">(${proposal.proposer_email})</span></td>
                </tr>
                <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#6B7280;font-weight:600;">Event Date</td>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:600;">${fmtDate(proposal.proposed_date)}</td>
                </tr>
                ${proposal.venue ? `<tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#6B7280;font-weight:600;">Venue</td><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:600;">${proposal.venue}</td></tr>` : ''}
                ${proposal.expected_attendance ? `<tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#6B7280;font-weight:600;">Expected Attendance</td><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:600;">${proposal.expected_attendance} people</td></tr>` : ''}
                <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#6B7280;font-weight:600;">Estimated Budget</td>
                    <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;font-weight:700;color:#4F46E5;">${fmtINR(proposal.estimated_total_budget)}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6B7280;font-weight:600;">Proposal ID</td>
                    <td style="padding:8px 0;font-size:12px;font-family:monospace;color:#6B7280;">${proposalId}</td>
                </tr>
            </table>
        </div>

        ${proposal.description ? `
        <div style="margin-bottom:24px;">
            <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">📝 Description</h3>
            <div style="background:#F8FAFC;padding:14px 16px;border-radius:8px;font-size:13px;line-height:1.7;color:#374151;">${proposal.description.replace(/\n/g, '<br>')}</div>
        </div>` : ''}

        ${itemsSection}

        <!-- CTA Buttons -->
        <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:2px solid #F1F5F9;">
            ${isL1Under10K ? `
            <a href="${appUrl}" style="display:inline-block;padding:14px 36px;background:#059669;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;letter-spacing:0.5px;">✓ OK, Acknowledged</a>
            <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">No action required — CMA approval is sufficient for budgets under ₹10,000</p>
            ` : isL1Over10K ? `
            <a href="${appUrl}" style="display:inline-block;padding:14px 36px;background:#D97706;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;letter-spacing:0.5px;">Review & Approve →</a>
            <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">Admin approval required for budgets ≥₹10,000</p>
            ` : `
            <a href="${viewUrl}" style="display:inline-block;padding:13px 28px;background:#4F46E5;color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin-right:12px;">View Proposal ↗</a>
            <a href="${appUrl}" style="display:inline-block;padding:13px 24px;background:#F8FAFC;color:#374151;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;border:2px solid #E5E7EB;">Open in App</a>
            `}
        </div>
    </div>

    <!-- Footer -->
    <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9CA3AF;">UniConnect Budget Management &nbsp;·&nbsp; This is an automated notification.</p>
    </div>
</div>
</body></html>`;
}

export async function notifyBudgetProposalUpdate(proposal: FullProposal, toStatus: BudgetProposalStatus, actorName: string, reason?: string) {
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
        case 'APPROVED_L1': {
            const budget = Number(proposal.estimated_total_budget) || 0;
            if (budget >= 10000) {
                // ≥₹10K → Admin approval required
                titleText = 'Budget Proposal — CMA Approved, Admin Approval Needed 🔔';
                bodyText = `${actorName} has given CMA approval for "${title}" (₹${budget.toLocaleString('en-IN')}). Admin approval is required as budget is ≥₹10,000.`;
            } else {
                // <₹10K → Just informational for admin, proposal can proceed
                titleText = `Budget Proposal Approved — ₹${budget.toLocaleString('en-IN')} ✅`;
                bodyText = `${actorName} has approved "${title}" for ${proposal.university_name || 'the university'} (₹${budget.toLocaleString('en-IN')}). This proposal is under ₹10,000 so CMA approval is sufficient. Procurement can proceed.\n\nProposed by: ${proposer_name} (${proposer_email})\n\nThis is for your information. No action needed — click OK to acknowledge.`;
            }
            isToSET = true;
            break;
        }
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
             WHERE (role IN ('ADMIN', 'PROGRAM_OPS') OR email IN ('programopscentral@nxtwave.in', 'karthikeya.a054@gmail.com', 'karthik@nxtwave.tech', 'pravalika.s@nxtwave.co.in'))
             AND is_active = true`
        );
        recipients = setRes.rows;

        // Ensure specifically requested stakeholders are ALWAYS included if they are not in the query result
        const stakeholderEmails = ['karthik@nxtwave.tech', 'pravalika.s@nxtwave.co.in'];
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
            const richHtml = buildBudgetProposalEmail(proposal, bodyText, baseUrl, proposalId);
            await addNotificationJob({
                to: recipient.email,
                subject: titleText,
                text: `Hello,\n\n${bodyText}\n\nView & review the proposal: ${baseUrl}/api/budget-proposals/${proposalId}/view\n\nOpen in App: ${baseUrl}${link}`,
                html: richHtml
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
