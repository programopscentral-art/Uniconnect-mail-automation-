import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_47uYdBVDTxXq@ep-raspy-field-adz2oa26.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sourcePool = new Pool({ connectionString: url });

async function audit() {
    const sClient = await sourcePool.connect();
    try {
        const { rows: taskCols } = await sClient.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tasks'");
        console.log('Task Columns:');
        console.log(JSON.stringify(taskCols, null, 2));

        const { rows: userCols } = await sClient.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users'");
        console.log('User Columns:');
        console.log(JSON.stringify(userCols, null, 2));
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        sClient.release();
        await sourcePool.end();
        process.exit(0);
    }
}

audit();
