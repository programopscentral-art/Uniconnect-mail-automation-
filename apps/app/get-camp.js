import pg from 'pg';
const { Client } = pg;
const client = new Client({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    const res = await client.query('SELECT id, status, total_recipients, sent_count FROM campaigns WHERE id = $1', ['ba4ef9dc-344d-4ff1-afdf-949953147a84']);
    process.stdout.write(JSON.stringify(res.rows[0], null, 2));
    await client.end();
}
run();
