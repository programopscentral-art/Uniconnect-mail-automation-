import { error } from '@sveltejs/kit';
import { getBudgetProposalById } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

// Public endpoint — no auth required to VIEW the report.
// Action buttons use fetch() → POST /api/budget-proposals/[id]/review (which requires auth).
// Usage: /api/budget-proposals/[id]/view

const PRIORITY_COLOR: Record<string, string> = {
    HIGH: '#DC2626',
    MED: '#D97706',
    LOW: '#16A34A'
};

const STATUS_COLOR: Record<string, string> = {
    DRAFT: '#6B7280',
    SUBMITTED: '#2563EB',
    UNDER_REVIEW: '#7C3AED',
    CHANGES_REQUESTED: '#D97706',
    APPROVED_L1: '#0D9488',
    APPROVED: '#16A34A',
    REJECTED: '#DC2626',
    EVENT_COMPLETED: '#6366F1',
    REPORT_SUBMITTED: '#2563EB',
    CLOSED: '#374151'
};

const STATUS_LABEL: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    UNDER_REVIEW: 'Under Review',
    CHANGES_REQUESTED: 'Changes Requested',
    APPROVED_L1: 'L1 Approved (Awaiting Final)',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    EVENT_COMPLETED: 'Event Completed',
    REPORT_SUBMITTED: 'Report Submitted',
    CLOSED: 'Closed'
};

const CATEGORY_LABEL: Record<string, string> = {
    VENUE: 'Venue', FOOD: 'Food & Beverages', SPEAKER: 'Speaker / Guest',
    TRAVEL: 'Travel', MARKETING: 'Marketing & Promotions', AWARDS: 'Awards',
    RECOGNITION: 'Recognition', HOSPITALITY: 'Hospitality', CERTIFICATES: 'Certificates',
    GIFTS: 'Gifts', MISC: 'Miscellaneous'
};

function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const GET: RequestHandler = async ({ params, url }) => {
    const proposal = await getBudgetProposalById(params.id);
    if (!proposal) throw error(404, 'Proposal not found');

    const baseUrl = process.env.PUBLIC_BASE_URL || url.origin;
    const appLink = `${baseUrl}/budget-proposals/${proposal.id}`;
    const reviewApiUrl = `/api/budget-proposals/${proposal.id}/review`;

    const statusColor = STATUS_COLOR[proposal.status] || '#6B7280';
    const priorityColor = PRIORITY_COLOR[proposal.priority] || '#6B7280';
    const statusLabel = STATUS_LABEL[proposal.status] || proposal.status;

    const canReview = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_L1', 'REPORT_SUBMITTED'].includes(proposal.status);
    const canClose = proposal.status === 'REPORT_SUBMITTED';

    // Build budget items rows
    const itemRows = (proposal.items || []).map((item: any) => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;">${CATEGORY_LABEL[item.category] || item.category}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;">${item.description}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:center;">${item.qty}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:right;">${fmt(item.unit_cost)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:600;">${fmt(item.amount)}</td>
            ${item.vendor_name ? `<td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#6B7280;">${item.vendor_name}</td>` : '<td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;color:#9CA3AF;font-size:12px;">—</td>'}
        </tr>
    `).join('');

    // Attachments
    const attachmentRows = (proposal.attachments || []).map((att: any) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#F8FAFC;border-radius:6px;margin-bottom:6px;">
            <span style="font-size:18px;">${att.file_type?.includes('image') ? '🖼️' : att.file_type?.includes('pdf') ? '📄' : '📎'}</span>
            <div style="flex:1;">
                <div style="font-weight:500;font-size:14px;">${att.file_name}</div>
                <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">${att.category}</div>
            </div>
            ${att.file_url ? `<a href="${att.file_url}" target="_blank" style="font-size:12px;color:#4F46E5;font-weight:600;">View ↗</a>` : ''}
        </div>
    `).join('');

    // Post-event report section
    const reportSection = proposal.report ? `
        <div style="margin-top:32px;border-top:2px solid #E5E7EB;padding-top:24px;">
            <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">📋 Post-Event Report</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${proposal.report.actual_date ? `<div style="background:#F8FAFC;padding:12px 16px;border-radius:8px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Actual Date</div><div style="font-weight:600;">${fmtDate(proposal.report.actual_date)}</div></div>` : ''}
                ${proposal.report.actual_attendance !== null ? `<div style="background:#F8FAFC;padding:12px 16px;border-radius:8px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Actual Attendance</div><div style="font-weight:600;">${proposal.report.actual_attendance}</div></div>` : ''}
                ${proposal.report.actual_budget_used !== null ? `<div style="background:#F8FAFC;padding:12px 16px;border-radius:8px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Budget Used</div><div style="font-weight:600;">${fmt(proposal.report.actual_budget_used)}</div></div>` : ''}
                ${proposal.report.remaining_budget !== null ? `<div style="background:#F8FAFC;padding:12px 16px;border-radius:8px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Remaining Budget</div><div style="font-weight:600;">${fmt(proposal.report.remaining_budget)}</div></div>` : ''}
            </div>
            ${proposal.report.outcomes ? `<div style="margin-top:12px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Outcomes</div><div style="background:#F0FDF4;padding:12px;border-radius:8px;border-left:4px solid #16A34A;">${proposal.report.outcomes}</div></div>` : ''}
            ${proposal.report.feedback_summary ? `<div style="margin-top:12px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Feedback Summary</div><div style="background:#EFF6FF;padding:12px;border-radius:8px;border-left:4px solid #2563EB;">${proposal.report.feedback_summary}</div></div>` : ''}
            ${proposal.report.issues_faced ? `<div style="margin-top:12px;"><div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Issues Faced</div><div style="background:#FEF2F2;padding:12px;border-radius:8px;border-left:4px solid #DC2626;">${proposal.report.issues_faced}</div></div>` : ''}
        </div>
    ` : '';

    // Action panel — shown for reviewable statuses
    const actionPanel = canReview ? `
        <div id="action-panel" style="margin-top:32px;background:#FAFAFA;border:2px solid #E5E7EB;border-radius:12px;padding:24px;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">⚡ Take Action</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#6B7280;">Select an action below. You must be logged in to UniConnect to submit. If not logged in, you will be redirected.</p>

            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                <label style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #E5E7EB;border-radius:8px;background:white;transition:all 0.2s;" onclick="selectAction(this,'approve')">
                    <input type="radio" name="bp_action" value="approve" style="display:none;">
                    <span style="font-size:20px;">✅</span>
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#111827;">Approve</div>
                        <div style="font-size:11px;color:#6B7280;">L1 or Final approval</div>
                    </div>
                </label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #E5E7EB;border-radius:8px;background:white;transition:all 0.2s;" onclick="selectAction(this,'request-changes')">
                    <input type="radio" name="bp_action" value="request-changes" style="display:none;">
                    <span style="font-size:20px;">🔄</span>
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#111827;">Request Changes</div>
                        <div style="font-size:11px;color:#6B7280;">Ask for modifications</div>
                    </div>
                </label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #E5E7EB;border-radius:8px;background:white;transition:all 0.2s;" onclick="selectAction(this,'reject')">
                    <input type="radio" name="bp_action" value="reject" style="display:none;">
                    <span style="font-size:20px;">❌</span>
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#111827;">Reject</div>
                        <div style="font-size:11px;color:#6B7280;">Decline this proposal</div>
                    </div>
                </label>
                ${canClose ? `
                <label style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #E5E7EB;border-radius:8px;background:white;transition:all 0.2s;" onclick="selectAction(this,'close')">
                    <input type="radio" name="bp_action" value="close" style="display:none;">
                    <span style="font-size:20px;">🔒</span>
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#111827;">Close</div>
                        <div style="font-size:11px;color:#6B7280;">Finalize after report</div>
                    </div>
                </label>` : ''}
            </div>

            <div id="approve-budget-field" style="display:none;margin-bottom:16px;">
                <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Approved Budget Amount (₹) <span style="color:#DC2626;">*</span></label>
                <input type="number" id="approved-budget" placeholder="Enter approved amount" style="width:100%;box-sizing:border-box;padding:10px 14px;border:2px solid #E5E7EB;border-radius:8px;font-size:14px;outline:none;" />
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Estimated: ${fmt(proposal.estimated_total_budget)} — Enter the final approved amount</div>
            </div>

            <div id="reason-field" style="margin-bottom:16px;">
                <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Notes / Reason <span id="reason-required" style="color:#DC2626;display:none;">*</span></label>
                <textarea id="action-reason" rows="4" placeholder="Add your notes or reason (required for reject / request changes)..." style="width:100%;box-sizing:border-box;padding:10px 14px;border:2px solid #E5E7EB;border-radius:8px;font-size:14px;resize:vertical;outline:none;font-family:inherit;"></textarea>
            </div>

            <div id="action-error" style="display:none;padding:10px 14px;background:#FEF2F2;border-radius:8px;color:#DC2626;font-size:13px;margin-bottom:12px;"></div>
            <div id="action-success" style="display:none;padding:10px 14px;background:#F0FDF4;border-radius:8px;color:#16A34A;font-size:13px;margin-bottom:12px;"></div>

            <div style="display:flex;gap:12px;align-items:center;">
                <button onclick="submitAction()" style="padding:12px 28px;background:#4F46E5;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Submit Decision</button>
                <a href="${appLink}" target="_blank" style="font-size:13px;color:#6B7280;text-decoration:underline;">Open in App ↗</a>
            </div>
        </div>
    ` : `
        <div style="margin-top:32px;background:#F8FAFC;border:2px solid #E5E7EB;border-radius:12px;padding:20px;text-align:center;">
            <p style="margin:0;color:#6B7280;font-size:14px;">This proposal is currently <strong>${statusLabel}</strong> — no review actions available at this stage.</p>
            <a href="${appLink}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#4F46E5;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open in App ↗</a>
        </div>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Budget Proposal — ${proposal.title}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F3F4F6; color: #111827; }
        .container { max-width: 860px; margin: 24px auto; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); padding: 32px 36px; color: white; }
        .header h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; }
        .header .meta { font-size: 14px; opacity: 0.8; }
        .body { padding: 32px 36px; }
        .section { margin-bottom: 28px; }
        .section-title { font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #F1F5F9; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .info-card { background: #F8FAFC; padding: 12px 16px; border-radius: 8px; }
        .info-card .label { font-size: 11px; color: #6B7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
        .info-card .value { font-size: 15px; font-weight: 600; color: #111827; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; font-weight: 700; color: #6B7280; background: #F8FAFC; border-bottom: 2px solid #E5E7EB; }
        .total-row td { padding: 12px; background: #F0FDF4; font-weight: 700; font-size: 15px; border-top: 2px solid #16A34A; }
        .action-card label:hover { border-color: #4F46E5 !important; background: #EEF2FF !important; }
        .action-card label.selected { border-color: #4F46E5 !important; background: #EEF2FF !important; }
        @media (max-width: 600px) {
            .body { padding: 20px; }
            .header { padding: 24px 20px; }
            .info-grid { grid-template-columns: 1fr 1fr; }
        }
    </style>
</head>
<body>
<div class="container">
    <!-- Header -->
    <div class="header">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div>
                <div style="font-size:12px;font-weight:600;opacity:0.7;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Budget Proposal</div>
                <h1>${proposal.title}</h1>
                <div class="meta">
                    ${proposal.university_name || ''} &nbsp;·&nbsp;
                    ${proposal.event_type.replace(/_/g, ' ')} &nbsp;·&nbsp;
                    ${fmtDate(proposal.proposed_date)}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div class="badge" style="background:${statusColor};font-size:13px;margin-bottom:8px;">${statusLabel}</div>
                <div class="badge" style="background:${priorityColor};">${proposal.priority} Priority</div>
            </div>
        </div>
    </div>

    <div class="body">
        <!-- Proposal Details -->
        <div class="section">
            <div class="section-title">📋 Proposal Details</div>
            <div class="info-grid">
                <div class="info-card">
                    <div class="label">Proposer</div>
                    <div class="value">${proposal.proposer_name || proposal.proposer_email}</div>
                    <div style="font-size:12px;color:#6B7280;margin-top:2px;">${proposal.proposer_email}</div>
                </div>
                <div class="info-card">
                    <div class="label">Proposed Date</div>
                    <div class="value">${fmtDate(proposal.proposed_date)}</div>
                </div>
                ${proposal.venue ? `<div class="info-card"><div class="label">Venue</div><div class="value">${proposal.venue}</div></div>` : ''}
                ${proposal.expected_attendance ? `<div class="info-card"><div class="label">Expected Attendance</div><div class="value">${proposal.expected_attendance} people</div></div>` : ''}
                <div class="info-card">
                    <div class="label">Estimated Budget</div>
                    <div class="value" style="color:#4F46E5;">${fmt(proposal.estimated_total_budget)}</div>
                </div>
                ${proposal.approved_total_budget !== null ? `<div class="info-card"><div class="label">Approved Budget</div><div class="value" style="color:#16A34A;">${fmt(proposal.approved_total_budget)}</div></div>` : ''}
                <div class="info-card">
                    <div class="label">Submitted</div>
                    <div class="value">${fmtDate(proposal.created_at)}</div>
                </div>
                <div class="info-card">
                    <div class="label">Proposal ID</div>
                    <div class="value" style="font-size:12px;font-family:monospace;">${proposal.id.slice(0, 8).toUpperCase()}</div>
                </div>
            </div>
        </div>

        ${proposal.description ? `
        <div class="section">
            <div class="section-title">📝 Event Description</div>
            <div style="background:#F8FAFC;padding:16px;border-radius:8px;line-height:1.7;font-size:14px;color:#374151;">${proposal.description.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}

        <!-- Budget Items -->
        ${(proposal.items || []).length > 0 ? `
        <div class="section">
            <div class="section-title">💰 Budget Breakdown</div>
            <div style="overflow-x:auto;border-radius:8px;border:1px solid #E5E7EB;">
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Description</th>
                            <th style="text-align:center;">Qty</th>
                            <th style="text-align:right;">Unit Cost</th>
                            <th style="text-align:right;">Amount</th>
                            <th>Vendor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemRows}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="4" style="text-align:right;padding:12px;">Total Estimated Budget</td>
                            <td style="text-align:right;padding:12px;color:#16A34A;">${fmt(proposal.estimated_total_budget)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
        ` : ''}

        <!-- Attachments -->
        ${(proposal.attachments || []).length > 0 ? `
        <div class="section">
            <div class="section-title">📎 Supporting Documents</div>
            ${attachmentRows}
        </div>
        ` : ''}

        ${reportSection}

        <!-- Action Panel -->
        <div class="action-card">
            ${actionPanel}
        </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 36px;background:#F8FAFC;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="font-size:12px;color:#9CA3AF;">UniConnect Budget Management &nbsp;·&nbsp; Proposal #${proposal.id.slice(0, 8).toUpperCase()}</div>
        <a href="${appLink}" target="_blank" style="font-size:12px;color:#4F46E5;font-weight:600;text-decoration:none;">Open in App ↗</a>
    </div>
</div>

<script>
    let selectedAction = null;

    function selectAction(label, action) {
        // Clear all
        document.querySelectorAll('[onclick^="selectAction"]').forEach(el => {
            el.style.borderColor = '#E5E7EB';
            el.style.background = 'white';
        });
        // Highlight selected
        label.style.borderColor = '#4F46E5';
        label.style.background = '#EEF2FF';
        selectedAction = action;

        // Show approve budget field only for approve action
        const budgetField = document.getElementById('approve-budget-field');
        const reasonRequired = document.getElementById('reason-required');
        if (budgetField) {
            budgetField.style.display = (action === 'approve') ? 'block' : 'none';
        }
        if (reasonRequired) {
            reasonRequired.style.display = (action === 'reject' || action === 'request-changes') ? 'inline' : 'none';
        }
    }

    async function submitAction() {
        if (!selectedAction) {
            showError('Please select an action first.');
            return;
        }

        const reason = document.getElementById('action-reason')?.value?.trim();
        const approvedBudgetEl = document.getElementById('approved-budget');
        const approvedBudget = approvedBudgetEl ? parseFloat(approvedBudgetEl.value) : undefined;

        if ((selectedAction === 'reject' || selectedAction === 'request-changes') && !reason) {
            showError('A reason is required for this action.');
            return;
        }
        if (selectedAction === 'approve' && approvedBudgetEl && approvedBudgetEl.style.display !== 'none' && !approvedBudget) {
            // approvedBudget is optional in some cases (L1 approval doesn't need it)
        }

        const body = { action: selectedAction, reason: reason || undefined };
        if (approvedBudget && !isNaN(approvedBudget)) body.approvedBudget = approvedBudget;

        hideMessages();
        const btn = document.querySelector('[onclick="submitAction()"]');
        if (btn) { btn.textContent = 'Submitting...'; btn.disabled = true; }

        try {
            const resp = await fetch('${reviewApiUrl}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });

            if (resp.status === 401) {
                showError('You are not logged in. Please log in to UniConnect first, then return to this page.');
                window.open('${baseUrl}/login?redirect=' + encodeURIComponent(window.location.href), '_blank');
                return;
            }
            if (resp.status === 403) {
                showError('You do not have permission to perform this action. Only CMA Managers and Admins can review budget proposals.');
                return;
            }
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                showError(data?.message || 'Action failed. Please try again or open in the app.');
                return;
            }

            const actionLabels = {
                approve: 'Approved successfully! The relevant parties have been notified.',
                reject: 'Proposal rejected. The proposer has been notified.',
                'request-changes': 'Change request sent. The proposer has been notified.',
                close: 'Proposal closed successfully.'
            };
            showSuccess(actionLabels[selectedAction] || 'Action completed.');
            document.getElementById('action-panel').style.opacity = '0.6';
            document.getElementById('action-panel').style.pointerEvents = 'none';
        } catch (err) {
            showError('Network error. Please check your connection and try again.');
        } finally {
            if (btn) { btn.textContent = 'Submit Decision'; btn.disabled = false; }
        }
    }

    function showError(msg) {
        const el = document.getElementById('action-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
        const s = document.getElementById('action-success');
        if (s) s.style.display = 'none';
    }

    function showSuccess(msg) {
        const el = document.getElementById('action-success');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
        const e = document.getElementById('action-error');
        if (e) e.style.display = 'none';
    }

    function hideMessages() {
        const e = document.getElementById('action-error');
        const s = document.getElementById('action-success');
        if (e) e.style.display = 'none';
        if (s) s.style.display = 'none';
    }
</script>
</body>
</html>`;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
};
