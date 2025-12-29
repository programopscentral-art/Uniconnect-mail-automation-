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

export const emailQueue = new Queue('email-sending', { connection });
export const systemNotificationQueue = new Queue('system-notifications', { connection });

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
    await emailQueue.add('send-email', { ...data }, {
        attempts: data.attempts || 5,
        backoff: {
            type: 'exponential',
            delay: 1000
        },
        delay,
        removeOnComplete: true,
        removeOnFail: 1000
    });
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
