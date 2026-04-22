/**
 * Full sync: sends ALL budget proposals to Facilities OS with proper status context.
 * Run with: node sync-to-facilities.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load .env
const envFile = readFileSync('./apps/app/.env', 'utf8');
let DATABASE_URL = '';
for (const line of envFile.split('\n')) {
    const cleaned = line.replace(/^\uFEFF/, '').trim();
    if (cleaned.startsWith('DATABASE_URL=')) {
        DATABASE_URL = cleaned.replace('DATABASE_URL=', '').replace(/^"|"$/g, '');
        break;
    }
}

const FACILITIES_URL = 'https://facilities-os-production.up.railway.app/api/webhooks/uniconnect';
const SECRET = 'uniconnect-facilities-2026';

if (!DATABASE_URL) { console.error('No DATABASE_URL found'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function getApprovalContext(proposal) {
    const budget = Number(proposal.estimated_total_budget) || 0;
    const status = proposal.status;
    const needsAdmin = budget >= 10000;

    const statusMap = {
        'DRAFT': { approval_status: 'draft', approval_note: 'Draft — not yet submitted', can_proceed: false },
        'SUBMITTED': { approval_status: 'submitted', approval_note: 'Submitted — awaiting CMA approval', can_proceed: false },
        'UNDER_REVIEW': { approval_status: 'under_review', approval_note: 'Under review by CMA', can_proceed: false },
        'CHANGES_REQUESTED': { approval_status: 'changes_requested', approval_note: 'Changes requested — awaiting resubmission', can_proceed: false },
        'APPROVED_L1': {
            approval_status: needsAdmin ? 'needs_admin_approval' : 'l1_approved',
            approval_note: needsAdmin
                ? `CMA approved (₹${budget.toLocaleString('en-IN')}) — awaiting Admin approval (budget ≥₹10K)`
                : `CMA approved (₹${budget.toLocaleString('en-IN')}) — ready for procurement (budget <₹10K)`,
            can_proceed: !needsAdmin
        },
        'APPROVED': { approval_status: 'fully_approved', approval_note: 'Fully approved — proceed with procurement', can_proceed: true },
        'REJECTED': { approval_status: 'rejected', approval_note: 'Proposal rejected', can_proceed: false },
        'EVENT_COMPLETED': { approval_status: 'event_completed', approval_note: 'Event completed — pending report', can_proceed: true },
        'REPORT_SUBMITTED': { approval_status: 'report_submitted', approval_note: 'Post-event report submitted', can_proceed: true },
        'CLOSED': { approval_status: 'closed', approval_note: 'Proposal closed', can_proceed: true },
    };

    return statusMap[status] || { approval_status: status.toLowerCase(), approval_note: status, can_proceed: false };
}

async function main() {
    console.log('Connecting to database...');

    // Get ALL proposals (every status)
    const { rows: proposals } = await pool.query(`
        SELECT bp.*,
               COALESCE(univ.short_name, univ.name) AS university_name
        FROM budget_proposals bp
        LEFT JOIN universities univ ON univ.id = bp.university_id
        ORDER BY bp.created_at DESC
    `);

    console.log(`Found ${proposals.length} total proposals`);
    console.log('Statuses:', [...new Set(proposals.map(p => p.status))].join(', '));

    let sent = 0, failed = 0;

    for (const proposal of proposals) {
        try {
            // Get items
            const { rows: items } = await pool.query(
                'SELECT * FROM budget_proposal_items WHERE proposal_id = $1',
                [proposal.id]
            );

            // Get tracking entries for approval chain
            let approvals = [];
            try {
                const { rows: tracking } = await pool.query(
                    `SELECT * FROM budget_proposal_tracking
                     WHERE proposal_id = $1
                     ORDER BY created_at`,
                    [proposal.id]
                );
                approvals = tracking
                    .filter(t => ['cm_approved', 'approved_l1', 'admin_approved', 'approved', 'submitted'].includes(t.status))
                    .map(t => ({
                        name: t.updated_by_name || 'System',
                        email: t.updated_by_email || '',
                        role: t.status.includes('admin') || t.status === 'approved' ? 'ADMIN' : t.status === 'submitted' ? 'SUBMITTER' : 'CMA_MANAGER',
                        status: t.status,
                        approved_at: t.created_at
                    }));
            } catch {}

            // Add submitter if no tracking
            if (approvals.length === 0) {
                approvals.push({
                    name: proposal.proposer_name || 'Unknown',
                    email: proposal.proposer_email || '',
                    role: 'SUBMITTER',
                    status: 'submitted',
                    approved_at: proposal.created_at
                });
            }

            const context = getApprovalContext(proposal);

            const payload = {
                action: 'proposal_approved',
                proposal: {
                    id: proposal.id,
                    title: proposal.title,
                    description: proposal.description,
                    university_id: proposal.university_id,
                    university_name: proposal.university_name,
                    proposer_name: proposal.proposer_name,
                    proposer_email: proposal.proposer_email,
                    estimated_total_budget: proposal.estimated_total_budget,
                    approved_total_budget: proposal.approved_total_budget || proposal.estimated_total_budget,
                    proposed_date: proposal.proposed_date,
                    venue: proposal.venue,
                    priority: proposal.priority || 'MED',
                    status: proposal.status,
                    ...context
                },
                items: items.map(i => ({
                    ...i,
                    // Map column names for Facilities OS
                    quantity: i.qty,
                    unit_price: i.unit_cost,
                    total_price: i.amount
                })),
                approvals
            };

            const statusIcon = context.can_proceed ? '✓' : context.approval_status === 'rejected' ? '✗' : '○';
            console.log(`\n${statusIcon} [${proposal.status}] "${proposal.title}" (${proposal.university_name}) — ₹${proposal.estimated_total_budget}`);
            console.log(`  ${context.approval_note}`);

            const res = await fetch(FACILITIES_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-secret': SECRET
                },
                body: JSON.stringify(payload)
            });

            const body = await res.text();
            if (res.ok) {
                console.log(`  → Sent OK — ${body}`);
                sent++;
            } else {
                console.log(`  → Failed (HTTP ${res.status}) — ${body}`);
                failed++;
            }

            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            console.log(`  → Error: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`DONE: ${sent} sent, ${failed} failed, ${proposals.length} total`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
