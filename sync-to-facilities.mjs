/**
 * Quick sync script: sends all approved budget proposals to Facilities OS.
 * Run with: node sync-to-facilities.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';

// Supabase uses self-signed certs via PgBouncer
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

async function main() {
    console.log('Connecting to database...');

    // Get ALL proposals (not just approved — send everything)
    const { rows: proposals } = await pool.query(`
        SELECT bp.*,
               COALESCE(univ.short_name, univ.name) AS university_name
        FROM budget_proposals bp
        LEFT JOIN universities univ ON univ.id = bp.university_id
        ORDER BY bp.created_at DESC
    `);

    console.log(`Found ${proposals.length} total proposals`);

    // Sync anything that has at least L1 (CMA) approval
    const toSync = proposals.filter(p =>
        ['APPROVED_L1', 'APPROVED_L2', 'APPROVED', 'EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED'].includes(p.status)
    );

    console.log(`${toSync.length} approved/completed proposals to sync`);
    console.log('Statuses:', [...new Set(proposals.map(p => p.status))].join(', '));

    let sent = 0, failed = 0;

    for (const proposal of toSync) {
        try {
            // Get items
            const { rows: items } = await pool.query(
                'SELECT * FROM budget_proposal_items WHERE proposal_id = $1',
                [proposal.id]
            );

            // Determine approval status for Facilities OS
            const needsAdminApproval = proposal.status === 'APPROVED_L1' &&
                (Number(proposal.estimated_total_budget) >= 10000 || Number(proposal.approved_total_budget) >= 10000);
            const isL1Only = proposal.status === 'APPROVED_L1';
            const isFullyApproved = ['APPROVED', 'EVENT_COMPLETED', 'REPORT_SUBMITTED', 'CLOSED'].includes(proposal.status);

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
                    approval_status: isFullyApproved ? 'fully_approved' : needsAdminApproval ? 'needs_admin_approval' : 'l1_approved',
                    approval_note: isFullyApproved
                        ? 'Fully approved — proceed with procurement'
                        : needsAdminApproval
                            ? `CMA approved — awaiting Admin approval (budget ≥₹10K)`
                            : 'CMA approved — ready for procurement (budget <₹10K)'
                },
                items: items,
                approvals: [{
                    name: isFullyApproved ? 'Admin' : 'Pravalika (CMA Manager)',
                    email: isFullyApproved ? '' : 'pravalika.s@nxtwave.co.in',
                    role: isFullyApproved ? 'ADMIN' : 'CMA_MANAGER',
                    approved_at: proposal.updated_at || proposal.created_at
                }]
            };

            console.log(`\nSending: "${proposal.title}" (${proposal.university_name}) — ₹${proposal.estimated_total_budget}`);

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
                console.log(`  ✓ Sent — ${body}`);
                sent++;
            } else {
                console.log(`  ✗ Failed (HTTP ${res.status}) — ${body}`);
                failed++;
            }

            // Small delay
            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            console.log(`  ✗ Error: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== DONE ===`);
    console.log(`Sent: ${sent}, Failed: ${failed}, Total: ${toSync.length}`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
