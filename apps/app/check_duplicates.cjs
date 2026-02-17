
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkStudents() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.replace('pgbouncer=true', 'pgbouncer=false'),
    });
    try {
        await client.connect();

        console.log('--- DUPLICATE STUDENT EMAILS ---');
        const dupEmails = await client.query('SELECT email, count(*) FROM students GROUP BY email HAVING count(*) > 1 LIMIT 10');
        console.log(dupEmails.rows);

        console.log('--- DUPLICATE STUDENT NAMES ---');
        const dupNames = await client.query('SELECT name, count(*) FROM students GROUP BY name HAVING count(*) > 1 LIMIT 10');
        console.log(dupNames.rows);

        console.log('--- CAMPAIGN RECIPIENTS FOR a1aa8752-3769-487c-9ad9-8975a6cf5f58 ---');
        const cid = 'a1aa8752-3769-487c-9ad9-8975a6cf5f58';
        const recs = await client.query(`
            SELECT r.to_email, s.name, s.external_id, count(*) 
            FROM campaign_recipients r 
            JOIN students s ON r.student_id = s.id 
            WHERE r.campaign_id = $1 
            GROUP BY r.to_email, s.name, s.external_id 
            HAVING count(*) > 0
            LIMIT 20
        `, [cid]);
        console.log(recs.rows);

        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkStudents();
