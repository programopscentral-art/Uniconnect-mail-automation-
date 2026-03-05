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
    try {
        await client.connect();
        console.log(`Checking Campaign: ${id}`);

        const campRes = await client.query('SELECT * FROM campaigns WHERE id = $1', [id]);
        console.log('Campaign Info:');
        console.table(campRes.rows);

        const recipients = await client.query('SELECT status, count(*) FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status', [id]);
        console.log('Recipient Stats:');
        console.table(recipients.rows);

        const failedOnes = await client.query('SELECT to_email, error_message FROM campaign_recipients WHERE campaign_id = $1 AND status = \'FAILED\' LIMIT 5', [id]);
        console.log('Sample Failures:');
        console.table(failedOnes.rows);

        const univId = campRes.rows[0]?.university_id;
        if (univId) {
            const studentCount = await client.query('SELECT count(*) FROM students WHERE university_id = $1', [univId]);
            console.log(`Total Students in University ${univId}: ${studentCount.rows[0].count}`);
        }

        await client.end();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

const cid = process.argv[2] || 'de572a0d-ea99-432b-b6df-e4fe229e8b3f';
checkCampaign(cid);
