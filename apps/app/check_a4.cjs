
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkA4() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();
        const cid = 'a4aa8752-3769-487c-9ad9-8975a6cf5f58';
        const recs = await client.query(`
            SELECT r.to_email, s.name, count(*) 
            FROM campaign_recipients r 
            JOIN students s ON r.student_id = s.id 
            WHERE r.campaign_id = $1 
            GROUP BY r.to_email, s.name
            LIMIT 20
        `, [cid]);
        console.log(recs.rows);
        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkA4();
