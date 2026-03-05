import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const envPath = fs.existsSync('apps/app/.env') ? 'apps/app/.env' : '.env';
dotenv.config({ path: envPath });

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkCampaign(id) {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    try {
        await client.connect();
        log(`Checking Campaign: ${id}`);

        const campRes = await client.query('SELECT * FROM campaigns WHERE id = $1', [id]);
        log('Campaign Info:');
        log(JSON.stringify(campRes.rows, null, 2));

        const recipients = await client.query('SELECT status, count(*) FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status', [id]);
        log('Recipient Stats:');
        log(JSON.stringify(recipients.rows, null, 2));

        const failedOnes = await client.query('SELECT to_email, error_message, updated_at FROM campaign_recipients WHERE campaign_id = $1 AND status = \'FAILED\' ORDER BY updated_at DESC LIMIT 10', [id]);
        log('Recent Failures:');
        log(JSON.stringify(failedOnes.rows, null, 2));

        const pendingOnes = await client.query('SELECT to_email, status, updated_at FROM campaign_recipients WHERE campaign_id = $1 AND status = \'PENDING\' LIMIT 5', [id]);
        log('Sample Pending:');
        log(JSON.stringify(pendingOnes.rows, null, 2));

        await client.end();
        fs.writeFileSync('debug_output.txt', output);
    } catch (err) {
        log('Check failed: ' + err.message);
        if (err.stack) log(err.stack);
    }
}

const cid = process.argv[2] || 'e217c2be-e20c-4abe-969c-9beea885647a';
checkCampaign(cid);
