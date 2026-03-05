
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkRecipients() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        await client.connect();
        const cid = 'a1aa8752-3769-487c-9ad9-8975a6cf5f58';

        console.log('--- DUPLICATE EMAILS ---');
        const dupEmails = await client.query('SELECT to_email, count(*) FROM campaign_recipients WHERE campaign_id = $1 GROUP BY to_email HAVING count(*) > 1', [cid]);
        console.log(dupEmails.rows);

        console.log('--- DUPLICATE STUDENTS ---');
        const dupStudents = await client.query('SELECT student_id, count(*) FROM campaign_recipients WHERE campaign_id = $1 GROUP BY student_id HAVING count(*) > 1', [cid]);
        console.log(dupStudents.rows);

        console.log('--- TOTAL RECIPIENTS ---');
        const total = await client.query('SELECT count(*) FROM campaign_recipients WHERE campaign_id = $1', [cid]);
        console.log(total.rows[0]);

        console.log('--- SAMPLE RECIPIENTS (to check for duplicates visually) ---');
        const samples = await client.query('SELECT r.to_email, s.name, s.external_id FROM campaign_recipients r JOIN students s ON r.student_id = s.id WHERE campaign_id = $1 LIMIT 10', [cid]);
        console.log(samples.rows);

        await client.end();
    } catch (err) {
        console.error(err);
    }
}
checkRecipients();
