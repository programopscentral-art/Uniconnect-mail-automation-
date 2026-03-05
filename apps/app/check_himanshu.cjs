
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkHimanshu() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();
        const res = await client.query('SELECT id, university_id, name, email, external_id FROM students WHERE email = $1', ['himanshudelhi2004@gmail.com']);
        console.log(res.rows);
        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkHimanshu();
