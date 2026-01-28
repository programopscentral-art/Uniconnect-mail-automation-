import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/app/.env' });

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkHealth() {
    try {
        await client.connect();
        console.log('Connected to DB.');

        console.log('\n--- Mailboxes ---');
        const mailboxes = await client.query('SELECT email, status, provider FROM mailbox_connections;');
        console.table(mailboxes.rows);

        console.log('\n--- Recent Campaigns ---');
        const campaigns = await client.query('SELECT id, name, status, total_recipients, sent_count, failed_count FROM campaigns ORDER BY updated_at DESC LIMIT 5;');
        console.table(campaigns.rows);

        console.log('\n--- Failed Recipients ---');
        const failed = await client.query('SELECT r.id, r.to_email, r.status, r.error_message, c.name as campaign_name FROM campaign_recipients r JOIN campaigns c ON r.campaign_id = c.id WHERE r.status = \'FAILED\' ORDER BY r.updated_at DESC LIMIT 10;');
        console.table(failed.rows);

        console.log('\n--- Pending/Queued Recipients ---');
        const pending = await client.query('SELECT count(*) FROM campaign_recipients WHERE status = \'PENDING\';');
        console.log('Pending count:', pending.rows[0].count);

        await client.end();
        process.exit(0);
    } catch (err) {
        console.error('Health check failed:', err);
        process.exit(1);
    }
}

checkHealth();
