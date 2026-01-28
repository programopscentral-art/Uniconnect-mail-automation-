import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/app/.env' });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl);

async function checkQueue() {
    try {
        console.log('Checking BullMQ Queues...');
        const keys = await connection.keys('bull:email-sending:*');
        console.log('Found keys:', keys);

        const waiting = await connection.llen('bull:email-sending:waiting');
        const active = await connection.llen('bull:email-sending:active');
        const completed = await connection.scard('bull:email-sending:completed');
        const failed = await connection.scard('bull:email-sending:failed');

        console.log({ waiting, active, completed, failed });

        process.exit(0);
    } catch (err) {
        console.error('Queue check failed:', err);
        process.exit(1);
    }
}

checkQueue();
