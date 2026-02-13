
const { Client } = require('pg');
require('dotenv').config();

async function debug() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT id, message_title, status, scheduled_at, creation_notified_at, notified_at 
            FROM communication_tasks 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('--- RECENT TASKS ---');
        console.table(res.rows);

        const now = await client.query('SELECT NOW() as now_db, NOW() AT TIME ZONE \'UTC\' as now_utc');
        console.log('--- DB CLOCK ---');
        console.table(now.rows);

        const workerCheck = await client.query(`
            SELECT count(*) FROM communication_tasks 
            WHERE status = 'Scheduled' AND scheduled_at <= NOW()
        `);
        console.log('--- PENDING DUE TASKS ---');
        console.log(workerCheck.rows[0].count);

        await client.end();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
