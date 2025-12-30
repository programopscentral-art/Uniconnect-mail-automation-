import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_47uYdBVDTxXq@ep-raspy-field-adz2oa26.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sourcePool = new Pool({ connectionString: url });

async function audit() {
    const sClient = await sourcePool.connect();
    try {
        const { rows } = await sClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        console.log('Source Tables:');
        console.log(JSON.stringify(rows.map(r => r.table_name), null, 2));
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        sClient.release();
        await sourcePool.end();
        process.exit(0);
    }
}

audit();
