import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379');

async function checkQueue() {
    try {
        // Check for waiting jobs
        const waiting = await redis.llen('bull:email:wait');
        console.log('Waiting jobs:', waiting);

        // Check for active jobs
        const active = await redis.llen('bull:email:active');
        console.log('Active jobs:', active);

        // Check for failed jobs
        const failed = await redis.llen('bull:email:failed');
        console.log('Failed jobs:', failed);

        // Check for completed jobs
        const completed = await redis.llen('bull:email:completed');
        console.log('Completed jobs:', completed);

        // Get a sample waiting job if any
        if (waiting > 0) {
            const job = await redis.lindex('bull:email:wait', 0);
            console.log('\nSample waiting job:', job);
        }

        // Get a sample failed job if any
        if (failed > 0) {
            const job = await redis.lindex('bull:email:failed', 0);
            console.log('\nSample failed job:', job);
        }

        await redis.quit();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkQueue();
