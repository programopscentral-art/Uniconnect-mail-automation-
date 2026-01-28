import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis('redis://localhost:6379', {
    maxRetriesPerRequest: null
});

const emailQueue = new Queue('email-sending', { connection });

async function testQueue() {
    console.log('Adding test job to email-sending queue...');

    const job = await emailQueue.add('send-email', {
        recipientId: 'test_123',
        campaignId: 'test-campaign',
        email: 'karthikeya.a544@gmail.com',
        trackingToken: 'test_token_123',
        templateId: 'some-template-id',
        mailboxId: 'some-mailbox-id',
        variables: {
            studentName: 'Test Student',
            metadata: {}
        }
    });

    console.log(`✅ Job added with ID: ${job.id}`);
    console.log('Check worker logs to see if it picks up the job!');

    await connection.quit();
    process.exit(0);
}

testQueue().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
