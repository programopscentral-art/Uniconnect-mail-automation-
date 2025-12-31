import { db } from '../src/db/client';

async function checkCampaignRecipients() {
    try {
        const campaignId = process.argv[2];
        if (!campaignId) {
            console.log('Usage: npx tsx scripts/check-campaign.ts <campaignId>');
            process.exit(1);
        }

        console.log(`Checking campaign: ${campaignId}`);

        const { rows: campaign } = await db.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
        console.log('Campaign Data:', campaign[0]);

        const { rows: recipients } = await db.query('SELECT * FROM campaign_recipients WHERE campaign_id = $1', [campaignId]);
        console.log(`Recipients found: ${recipients.length}`);

        if (recipients.length > 0) {
            console.log('First 5 recipients:');
            console.table(recipients.slice(0, 5).map(r => ({
                id: r.id,
                student_id: r.student_id,
                to_email: r.to_email,
                status: r.status
            })));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.pool.end();
        process.exit(0);
    }
}

checkCampaignRecipients();
