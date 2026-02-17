
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkRecipientsDirect() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();
        const cid = 'a4aa8752-3769-487c-9ad9-8975a6cf5f58';
        const res = await client.query('SELECT count(*) FROM campaign_recipients WHERE campaign_id = $1', [cid]);
        console.log('Direct count in campaign_recipients:', res.rows[0].count);

        const samples = await client.query('SELECT to_email, status FROM campaign_recipients WHERE campaign_id = $1 LIMIT 5', [cid]);
        console.log('Sample recipients:', samples.rows);

        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkRecipientsDirect();
