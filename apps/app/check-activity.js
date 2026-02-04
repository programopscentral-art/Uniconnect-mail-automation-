import pg from 'pg';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = pg;
const client = new Client({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    const campaignId = 'ba4ef9dc-344d-4ff1-afdf-949953147a84';
    const res = await client.query('SELECT status, updated_at FROM campaign_recipients WHERE campaign_id = $1 AND status = \'SENT\' ORDER BY updated_at DESC LIMIT 1', [campaignId]);
    process.stdout.write(JSON.stringify(res.rows[0], null, 2));
    await client.end();
}
run();
