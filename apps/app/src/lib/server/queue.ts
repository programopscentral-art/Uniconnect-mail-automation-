import { Queue } from 'bullmq';
import { env } from '$env/dynamic/private';

// Reuse Redis connection string or create connection object
const redisUrl = env.REDIS_URL || 'redis://localhost:6379';

// Parse URL for connection options if needed, or pass URL directly if supported strictly
// BullMQ takes connection options. IORedis parse URL automatically.
import IORedis from 'ioredis';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null
});

connection.on('connect', () => console.log('[QUEUE] ✅ Redis connected'));
connection.on('error', (err) => console.error('[QUEUE] ❌ Redis error:', err));

export const emailQueue = new Queue('email-sending', { connection });
export const systemNotificationQueue = new Queue('system-notifications', { connection });
export const commTaskNotificationQueue = new Queue('comm-task-notifications', { connection });

console.log('[QUEUE_INIT] Email queue created for: email-sending');
console.log('[QUEUE_INIT] System queue created for: system-notifications');
console.log('[QUEUE_INIT] Comm task queue created for: comm-task-notifications');

export async function addEmailJob(data: {
    recipientId: string;
    campaignId: string;
    email: string;
    trackingToken: string;
    templateId: string;
    mailboxId: string;
    variables: any;
    includeAck?: boolean;
    attempts?: number;
}, delay: number = 0) {
    console.log(`[QUEUE] 📨 Adding email job for ${data.email} in campaign ${data.campaignId}`);
    console.log(`[QUEUE] 📋 Job details:`, { recipientId: data.recipientId, templateId: data.templateId, mailboxId: data.mailboxId });
    try {
        const job = await emailQueue.add('send-email', { ...data }, {
            attempts: data.attempts || 5,
            backoff: {
                type: 'exponential',
                delay: 1000
            },
            delay,
            removeOnComplete: true,
            removeOnFail: 1000
        });
        console.log(`[QUEUE] ✅ Successfully added job ${job.id} for ${data.email}`);
        console.log(`[QUEUE] 🎯 Job ${job.id} is now in queue 'email-sending'`);
        return job.id;
    } catch (err) {
        console.error(`[QUEUE] ❌ Failed to add job for ${data.email}:`, err);
        throw err;
    }
}

export async function addNotificationJob(data: {
    to: string;
    subject: string;
    text: string;
    html: string;
}) {
    await systemNotificationQueue.add('send-notification', data, {
        attempts: 3,
        removeOnComplete: true
    });
}

export async function triggerCommTaskCheck() {
    await commTaskNotificationQueue.add('check-tasks', {}, {
        removeOnComplete: true
    });
}
