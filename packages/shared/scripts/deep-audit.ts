import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_47uYdBVDTxXq@ep-raspy-field-adz2oa26.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sourcePool = new Pool({ connectionString: url });

async function deepAudit() {
    const sClient = await sourcePool.connect();
    try {
        console.log('--- Comprehensive Source DB Audit ---');

        const { rows: tables } = await sClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");

        for (const table of tables) {
            const tableName = table.table_name;
            const { rows: count } = await sClient.query(`SELECT COUNT(*) FROM "${tableName}"`);
            console.log(`Table [${tableName}]: ${count[0].count} rows`);
        }

        console.log('\n--- Checking for other Schemas ---');
        const { rows: schemas } = await sClient.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')");
        console.log('Schemas found:', schemas.map(s => s.schema_name));

    } catch (err) {
        console.error('Deep Audit failed:', err);
    } finally {
        sClient.release();
        await sourcePool.end();
        process.exit(0);
    }
}

deepAudit();
