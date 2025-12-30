import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_KnahdlHB61FN@ep-fragrant-lab-ad3b3xd8.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sourcePool = new Pool({ connectionString: url });

async function check() {
    const sClient = await sourcePool.connect();
    try {
        const { rows } = await sClient.query("SELECT email, first_name, last_name FROM users WHERE first_name IS NULL OR first_name = '' LIMIT 20");
        console.log('Users with missing names:');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        sClient.release();
        await sourcePool.end();
        process.exit(0);
    }
}

check();
