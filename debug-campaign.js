const { Client } = require('pg');

async function check() {
    const client = new Client({
        connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require"
    });

    try {
        await client.connect();
        const campaignId = 'ba4ef9dc-344d-4ff1-afdf-949953147a84';
        const res = await client.query(`
            SELECT c.id, c.status, c.total_recipients, u.id as university_id, 
                   (SELECT COUNT(*) FROM students WHERE university_id = c.university_id) as student_count,
                   (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id) as current_recipients
            FROM campaigns c 
            JOIN universities u ON c.university_id = u.id 
            WHERE c.id = $1;
        `, [campaignId]);

        console.log(JSON.stringify(res.rows[0], null, 2));
        await client.end();
        process.exit(0);
    } catch (err) {
        console.error(err);
        await client.end();
        process.exit(1);
    }
}

check();
