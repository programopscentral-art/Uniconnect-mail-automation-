import { Pool } from 'pg';

const url = 'postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require';
const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

async function audit() {
    const client = await pool.connect();
    try {
        console.log('--- Database Tables ---');
        const { rows: tables } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        console.log(tables.map(t => t.table_name));

        console.log('\n--- University Audit ---');
        const { rows: univs } = await client.query('SELECT * FROM universities ORDER BY name');
        console.log(`Found ${univs.length} universities.`);

        for (const u of univs) {
            const { rows: taskCount } = await client.query('SELECT COUNT(*) FROM tasks WHERE university_id = $1', [u.id]);
            const { rows: userCount } = await client.query('SELECT COUNT(*) FROM users WHERE university_id = $1', [u.id]);
            let studentCount = 0;
            try {
                const { rows: sCount } = await client.query('SELECT COUNT(*) FROM students WHERE university_id = $1', [u.id]);
                studentCount = parseInt(sCount[0].count);
            } catch (e) { }

            console.log(`[${u.name}] (ID: ${u.id}) - Tasks: ${taskCount[0].count}, Users: ${userCount[0].count}, Students: ${studentCount}`);
        }
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

audit();
