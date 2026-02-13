const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    await client.connect();
    const res = await client.query(`
        SELECT n.title, n.message, u.email, u.role, n.created_at 
        FROM notifications n 
        JOIN users u ON n.user_id = u.id 
        ORDER BY n.created_at DESC 
        LIMIT 10
    `);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}

run().catch(console.error);
