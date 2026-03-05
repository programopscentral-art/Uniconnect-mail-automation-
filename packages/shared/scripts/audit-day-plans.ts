import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_KnahdlHB61FN@ep-fragrant-lab-ad3b3xd8.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sourcePool = new Pool({ connectionString: url });

async function audit() {
    const sClient = await sourcePool.connect();
    try {
        const { rows: samples } = await sClient.query("SELECT title FROM day_plans ORDER BY created_at DESC LIMIT 10");
        console.log('Latest Day Plans:', JSON.stringify(samples, null, 2));
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        sClient.release();
        await sourcePool.end();
        process.exit(0);
    }
}

audit();
