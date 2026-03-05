
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function testDB() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        console.log('Connecting to DB...');
        await client.connect();
        console.log('Connected!');
        const res = await client.query('SELECT NOW()');
        console.log('Query result:', res.rows[0]);
        await client.end();
    } catch (err) {
        console.error('DB Connection Failed:', err);
    }
}
testDB();
