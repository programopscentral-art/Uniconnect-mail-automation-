import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/app/.env' });

const { Client } = pg;

async function checkCampaign() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    const campaignId = 'e217c2be-e20c-4abe-969c-9beea885647a';

    console.log('Checking campaign:', campaignId);

    const campaign = await client.query(
        'SELECT id, name, status, scheduled_at, started_at, completed_at FROM campaigns WHERE id = $1',
        [campaignId]
    );

    console.log('\n=== CAMPAIGN INFO ===');
    console.log(JSON.stringify(campaign.rows[0], null, 2));

    const recipients = await client.query(
        'SELECT status, COUNT(*) as count FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status',
        [campaignId]
    );

    console.log('\n=== RECIPIENT STATS ===');
    console.log(JSON.stringify(recipients.rows, null, 2));

    const failed = await client.query(
        'SELECT to_email, error_message FROM campaign_recipients WHERE campaign_id = $1 AND status = $2 LIMIT 5',
        [campaignId, 'FAILED']
    );

    if (failed.rows.length > 0) {
        console.log('\n=== SAMPLE FAILURES ===');
        console.log(JSON.stringify(failed.rows, null, 2));
    }

    await client.end();
}

checkCampaign().catch(console.error);
