
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkUniversity() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();
        const cid = 'a4aa8752-3769-487c-9ad9-8975a6cf5f58';
        const camp = await client.query('SELECT university_id FROM campaigns WHERE id = $1', [cid]);
        if (camp.rows.length === 0) {
            console.log('Campaign not found');
            return;
        }
        const uid = camp.rows[0].university_id;
        console.log('University ID:', uid);

        const studentCount = await client.query('SELECT count(*) FROM students WHERE university_id = $1', [uid]);
        console.log('Total students in DB for this university:', studentCount.rows[0].count);

        const recCount = await client.query('SELECT count(*) FROM campaign_recipients WHERE campaign_id = $1', [cid]);
        console.log('Total recipients in campaign:', recCount.rows[0].count);

        const dups = await client.query(`
            SELECT email, count(*) 
            FROM students 
            WHERE university_id = $1 
            GROUP BY email 
            HAVING count(*) > 1
        `, [uid]);
        console.log('Duplicate students (by email) in this university:', dups.rows);

        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkUniversity();
