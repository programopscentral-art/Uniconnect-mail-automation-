
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function listCampaigns() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();
        const res = await client.query('SELECT id, name, total_recipients FROM campaigns ORDER BY created_at DESC LIMIT 5');
        console.log(res.rows);
        await client.end();
    } catch (err) {
        console.error(err);
    }
}
listCampaigns();
