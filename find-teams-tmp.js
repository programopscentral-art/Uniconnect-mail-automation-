const { Client } = require('pg');
require('dotenv').config();

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query("SELECT id, name FROM universities WHERE name ILIKE '%Central%' OR name ILIKE '%CRM%'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Failed to query universities:', err);
    } finally {
        await client.end();
        process.exit(0);
    }
}

run();
