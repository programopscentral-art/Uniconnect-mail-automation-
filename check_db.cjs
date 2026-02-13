
const { Client } = require('pg');
require('dotenv').config();

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        const res = await client.query("SELECT id, message_title, status, scheduled_at, creation_notified_at, notified_at FROM communication_tasks WHERE status != 'Completed' ORDER BY created_at DESC LIMIT 5");
        console.log(JSON.stringify(res.rows, null, 2));
        await client.end();
    } catch (e) {
        console.error(e);
    }
}
check();
