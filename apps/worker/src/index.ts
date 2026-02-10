import dotenv from 'dotenv';
import path from 'path';

// Load env only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Standardize env access for shared package
process.env.ENCRYPTION_KEY_BASE64 = process.env.ENCRYPTION_KEY_BASE64;

import { Worker, Queue, type Job } from 'bullmq';
import * as admin from 'firebase-admin';
import {
  db,
  getTemplateById,
  getMailboxCredentials,
  decryptString,
  TemplateRenderer,
  getTasksDueSoon,
  markReminderSent,
  createNotification,
  getDueCommunicationTasks,
  getUserFcmTokens,
  updateCommunicationTaskStatus,
  getCommunicationTasksForReminders
} from '@uniconnect/shared';
import { google } from 'googleapis';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
// @ts-ignore
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// Log database connection info for debugging
const dbUrl = process.env.DATABASE_URL || '';
const dbHost = dbUrl.split('@')[1]?.split('/')[0] || 'unknown';
console.log(`[WORKER_INIT] Database Host: ${dbHost}`);

// Queues (for adding jobs from worker if needed)
const systemNotificationQueue = new Queue('system-notifications', { connection });

// Updates status of individual recipient atomically
async function updateRecipientStatus(id: string, status: 'SENT' | 'FAILED' | 'CANCELLED', messageId?: string, error?: string) {
  // Use a transaction/subquery to ensure we only increment if the status actually changed FROM a non-terminal state
  const res = await db.query(
    `UPDATE campaign_recipients 
     SET status = $1, 
         sent_at = CASE WHEN $1 = 'SENT' THEN NOW() ELSE sent_at END, 
         gmail_message_id = $2, 
         error_message = $3, 
         updated_at = NOW() 
     WHERE id = $4 AND status NOT IN ('SENT', 'FAILED', 'CANCELLED')
     RETURNING campaign_id`,
    [status, messageId, error, id]
  );

  if (res.rows[0]) {
    const campaignId = res.rows[0].campaign_id;
    if (status === 'SENT') {
      await db.query(`UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1`, [campaignId]);
    } else if (status === 'FAILED') {
      await db.query(`UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1`, [campaignId]);
    }

    // Check completion
    const { rows: stats } = await db.query(
      `SELECT total_recipients, sent_count, failed_count FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    if (stats[0] && stats[0].sent_count + stats[0].failed_count >= stats[0].total_recipients) {
      await db.query(`UPDATE campaigns SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1 AND status = 'IN_PROGRESS'`, [campaignId]);
    }
  }
}

// 1. Email Campaign Worker
console.log('[WORKER_INIT] 🚀 Starting email-sending worker...');
const worker = new Worker('email-sending', async (job: Job) => {
  console.log(`[WORKER] ✉️  Received job ${job.id} for campaign ${job.data.campaignId}`);
  const { recipientId, campaignId, email, trackingToken, templateId, mailboxId, variables } = job.data;
  console.log(`[WORKER] 📧 Processing job ${job.id} for ${email}`);

  try {
    // 1. Check if campaign is STOPPED
    const { rows: campaignRows } = await db.query(`SELECT status FROM campaigns WHERE id = $1`, [campaignId]);
    if (campaignRows[0]?.status === 'STOPPED') {
      console.log(`[WORKER] Skipping job ${job.id} - Campaign ${campaignId} is STOPPED.`);
      if (recipientId && recipientId !== 'test_recipient') {
        await updateRecipientStatus(recipientId, 'CANCELLED', undefined, 'Campaign stopped by user');
      }
      return { skipped: true, reason: 'STOPPED' };
    }
    const template = await getTemplateById(templateId);
    if (!template) throw new Error('Template not found');

    const mailbox = await getMailboxCredentials(mailboxId);
    if (!mailbox) throw new Error('Mailbox not found');

    const refreshToken = decryptString(mailbox.refresh_token_enc);
    if (!refreshToken) throw new Error('Failed to decrypt token');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { token } = await oauth2Client.getAccessToken();
    if (!token) throw new Error('Failed to get access token');

    // Prepare extended variables
    let metaObj = variables.metadata || {};
    if (typeof metaObj === 'string') {
      try { metaObj = JSON.parse(metaObj); } catch (e) { metaObj = {}; }
    }
    metaObj = metaObj || {};

    // CRITICAL FIX: Normalize metadata keys in the worker too
    const normalizedMeta: any = {};
    Object.entries(metaObj).forEach(([key, value]) => {
      const normalizedKey = String(key).replace(/[\r\n]+/g, ' ').trim();
      normalizedMeta[normalizedKey] = value;
    });

    const extendedVars = {
      ...variables,
      STUDENT_NAME: variables.studentName,
      ...normalizedMeta
    };

    console.log(`[WORKER] Extended Vars Keys: ${Object.keys(extendedVars).filter(k => !k.includes('html') && !k.includes('text')).join(', ')}`);
    console.log(`[WORKER] Sample Metadata Resolution Check: ${extendedVars['Term 1 Fee adjustment (O/S +ve and Excess -Ve)'] || 'NOT_FOUND'}`);


    // Render subject and final HTML with branding
    const subject = TemplateRenderer.render(template.subject, extendedVars, { config: template.config, noLayout: true }).replace(/<[^>]*>/g, '').trim();
    const htmlBodyWithPixel = TemplateRenderer.render(template.html, extendedVars, {
      includeAck: job.data.includeAck !== undefined ? job.data.includeAck : true,
      trackingToken: trackingToken,
      baseUrl: process.env.PUBLIC_BASE_URL,
      config: template.config
    });

    console.log(`Sending to ${email} via Gmail API...`);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create raw email message (Standard RFC 2822)
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `MIME-Version: 1.0`,
      `To: ${email}`,
      `From: "NIAT Support" <${mailbox.email}>`,
      `Subject: ${utf8Subject}`,
      `X-UniConnect-Token: ${trackingToken}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      Buffer.from(htmlBodyWithPixel).toString('base64')
    ];

    const rawMessage = messageParts.join('\r\n');
    const encodedMail = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMail
      }
    });

    console.log(`[WORKER] Sent to ${email}: ${res.data.id}`);

    // Only update DB if it's a real recipient (not a test_recipient)
    try {
      if (recipientId && recipientId !== 'test_recipient') {
        await updateRecipientStatus(recipientId, 'SENT', res.data.id || undefined);
      } else {
        console.log(`[WORKER] Test email sent successfully, skipping DB update.`);
      }
    } catch (dbErr: any) {
      console.error(`[WORKER] Email SENT but DB update failed for ${email}:`, dbErr);
    }

    return { sent: true, messageId: res.data.id };
  } catch (err: any) {
    console.error(`[WORKER] Failed job ${job.id} for ${email}:`, err);
    if (recipientId && recipientId !== 'test_recipient') {
      await updateRecipientStatus(recipientId, 'FAILED', undefined, err.message);
    }
    throw err;
  }
}, {
  connection,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000
  }
});

worker.on('error', err => console.error('[WORKER_ERROR] ❌', err));
worker.on('failed', (job, err) => console.error(`[JOB_FAILED] ❌ Job ${job?.id} failed:`, err));
worker.on('completed', job => console.log(`[WORKER_SUCCESS] ✅ Job ${job?.id} finished.`));
worker.on('active', job => console.log(`[WORKER_ACTIVE] 🔄 Job ${job?.id} started processing`));
worker.on('stalled', jobId => console.warn(`[WORKER_STALLED] ⚠️  Job ${jobId} stalled`));

// 2. System Notification Worker
const systemWorker = new Worker('system-notifications', async (job: Job) => {
  const { to, subject, text, html } = job.data;
  console.log(`[SYSTEM-NOTIF] Processing job ${job.id} for ${to}`);

  try {
    // 1. Try to find an ADMIN or PROGRAM_OPS mailbox first
    let mailboxRes = await db.query(
      `SELECT m.* FROM mailbox_connections m 
       JOIN users u ON m.email = u.email 
       WHERE u.role IN ('ADMIN', 'PROGRAM_OPS') AND m.status = 'ACTIVE'
       LIMIT 1`
    );

    // 1b. Fallback to ANY active mailbox if no admin mailbox found
    if (mailboxRes.rows.length === 0) {
      mailboxRes = await db.query(
        `SELECT * FROM mailbox_connections WHERE status = 'ACTIVE' LIMIT 1`
      );
    }

    if (mailboxRes.rows[0]) {
      const mailbox = mailboxRes.rows[0];
      console.log(`[SYSTEM-NOTIF] Using Gmail API fallback via ${mailbox.email}`);

      const refreshToken = decryptString(mailbox.refresh_token_enc);
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `MIME-Version: 1.0`,
        `To: ${to}`,
        `From: "UniConnect" <${mailbox.email}>`,
        `Subject: ${utf8Subject}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: base64`,
        '',
        Buffer.from(html).toString('base64')
      ];

      const rawMessage = messageParts.join('\r\n');
      const encodedMail = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMail }
      });

      console.log(`[SYSTEM-NOTIF] Success (API): Notification sent to ${to}`);
      return;
    }

    // 2. Fallback to SMTP if no mailbox is available
    console.log(`[SYSTEM-NOTIF] No mailbox found, falling back to SMTP...`);
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('No mailbox connected and no SMTP credentials provided');
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 10000,
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"UniConnect" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html
    });

    console.log(`[SYSTEM-NOTIF] Success (SMTP): Notification sent to ${to}`);
  } catch (err: any) {
    console.error(`[SYSTEM-NOTIF] ERROR: Failed system notification to ${to}:`, err);
    throw err;
  }
}, { connection });

systemWorker.on('error', err => console.error('[SYSTEM_WORKER_ERROR]', err));
systemWorker.on('failed', (job, err) => console.error('[SYSTEM_JOB_FAILED]', job?.id, err));
systemWorker.on('completed', job => console.log(`[SYSTEM_WORKER_SUCCESS] Job ${job?.id} finished.`));

// 3. Task Deadline Reminder Logic
async function checkTaskDeadlines() {
  console.log('[REMITTER] Checking for upcoming deadlines...');
  try {
    const tasks = await getTasksDueSoon(1); // 1 hour
    console.log(`[REMITTER] Found ${tasks.length} tasks due soon.`);

    for (const task of tasks) {
      if (task.assigned_to && task.user_email) {
        // Internal Notification
        await createNotification({
          user_id: task.assigned_to,
          university_id: task.university_id,
          title: 'Upcoming Deadline',
          message: `Task "${task.title}" is due in less than 1 hour!`,
          type: 'SYSTEM',
          link: '/tasks'
        });

        // Email Notification via systemNotificationQueue
        await systemNotificationQueue.add('send-notification', {
          to: task.user_email,
          subject: `Deadline Reminder: ${task.title}`,
          text: `Hi ${task.user_name || 'there'},\n\nThis is a reminder that your task "${task.title}" is due soon (${new Date(task.due_date).toLocaleTimeString()}).\n\nPlease complete it on time.`,
          html: `
                        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fee2e2; background: #fffafb; border-radius: 8px;">
                            <h3 style="color: #991b1b; margin-top: 0;">Deadline Reminder</h3>
                            <p>Your task <strong>${task.title}</strong> is due in less than 1 hour.</p>
                            <p style="font-size: 14px; color: #6b7280;">Due at: ${new Date(task.due_date).toLocaleString()}</p>
                            <a href="${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}/tasks" style="display: inline-block; margin-top: 15px; color: #2563eb; font-weight: bold; text-decoration: none;">View Task</a>
                        </div>
                    `
        });

        await markReminderSent(task.id);
        console.log(`[REMITTER] Notifications sent for task: ${task.id} (${task.title}) to ${task.user_email}`);
      } else {
        console.log(`[REMITTER] Skipping task ${task.id} - no assignee or email.`);
      }
    }
    if (tasks.length === 0) console.log('[REMITTER] No tasks due within 1 hour found.');
  } catch (err) {
    console.error('[REMITTER] Error checking deadlines:', err);
  }
}

// Check every 15 minutes
setInterval(checkTaskDeadlines, 15 * 60 * 1000);
// Run once on start
checkTaskDeadlines();

console.log('✅ Worker started with Campaign, System, and Reminder support.');
console.log('📬 Listening for jobs on queue: email-sending');
console.log('🔔 Listening for jobs on queue: system-notifications');

// 4. Communication Task Management (FCM)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized with service account.');
  } catch (e) {
    console.error('❌ Failed to initialize Firebase Admin:', e);
  }
} else {
  console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found. FCM notifications will be skipped.');
}

async function processCommunicationTasks() {
  console.log('[COMM-SCHEDULER] Checking for communication task notifications...');
  try {
    // 1. Fetch tasks that need ANY kind of reminder
    const tasks = await getCommunicationTasksForReminders();
    if (tasks.length === 0) return;

    console.log(`[COMM-SCHEDULER] Processing ${tasks.length} tasks for notifications.`);

    for (const task of tasks) {
      let notificationType: 'CREATION' | 'DAY_START' | 'TEN_MIN' | 'DUE' | null = null;
      const now = new Date();
      const scheduledAt = new Date(task.scheduled_at);

      // A. DUE NOW (Status: Scheduled, time passed)
      if (task.status === 'Scheduled' && scheduledAt <= now) {
        notificationType = 'DUE';
      }
      // B. 10 MIN REMINDER (Scheduled, within 10-12 mins, not sent)
      else if (task.status === 'Scheduled' && !task.ten_min_reminder_sent && (scheduledAt.getTime() - now.getTime()) <= 10.5 * 60 * 1000) {
        notificationType = 'TEN_MIN';
      }
      // C. DAY START REMINDER (Scheduled, is today, not sent today)
      else if (task.status === 'Scheduled' && !task.day_start_notified_at && scheduledAt.toDateString() === now.toDateString()) {
        notificationType = 'DAY_START';
      }
      // D. CREATION ALERT (Unnotified at creation)
      else if (!task.creation_notified_at) {
        notificationType = 'CREATION';
      }

      if (!notificationType) continue;

      const allTokens: string[] = [];

      // 1. Get all users associated with these universities
      // We check both university IDs and names (for backward compatibility)
      const usersRes = await db.query(
        `SELECT DISTINCT u.id FROM users u
         LEFT JOIN user_universities uu ON u.id = uu.user_id
         LEFT JOIN universities un ON (u.university_id = un.id OR uu.university_id = un.id)
         WHERE u.is_active = true 
         AND (
           un.id::text = ANY($1::text[]) OR 
           un.name = ANY($1::text[]) OR 
           un.short_name = ANY($1::text[])
         )`,
        [task.universities]
      );

      const recipientIds = usersRes.rows.map(r => r.id);

      // Also include any specifically assigned staff (if any)
      if (task.assigned_to && task.assigned_to.length > 0) {
        recipientIds.push(...task.assigned_to);
      }

      const uniqueRecipientIds = [...new Set(recipientIds)];

      for (const userId of uniqueRecipientIds) {
        const tokens = await getUserFcmTokens(userId);
        allTokens.push(...tokens);
      }

      if (allTokens.length > 0 && admin.apps.length > 0) {
        let title = '';
        let body = '';

        switch (notificationType) {
          case 'CREATION':
            title = 'New Task Assigned';
            body = `A new ${task.channel} task for ${task.universities.join(', ')} has been scheduled for ${scheduledAt.toLocaleString()}.`;
            break;
          case 'DAY_START':
            title = 'Task Scheduled Today';
            body = `Reminder: You have a ${task.channel} task due today at ${scheduledAt.toLocaleTimeString()}.`;
            break;
          case 'TEN_MIN':
            title = 'Task Due in 10 Min';
            body = `Final Reminder: Prepare to send the ${task.channel} message for ${task.universities.join(', ')}.`;
            break;
          case 'DUE':
            title = 'Task Due Now';
            body = `Action Required: Send ${task.channel} message for ${task.universities.join(', ')}.`;
            break;
        }

        const message = {
          notification: { title, body },
          data: {
            taskId: task.id,
            action: 'OPEN_TASK'
          },
          tokens: allTokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[COMM-SCHEDULER] Sent ${notificationType} notification for task ${task.id}. Success: ${response.successCount}`);
      }

      // Update DB state
      let updateQuery = '';
      const params: any[] = [task.id];
      const taskAgeMinutes = (now.getTime() - new Date(task.created_at).getTime()) / (60000);

      // ONLY mark as notified if we actually sent something OR if we've tried for 5 minutes
      const shouldMark = allTokens.length > 0 || taskAgeMinutes > 5;

      if (notificationType === 'CREATION' && shouldMark) {
        updateQuery = 'UPDATE communication_tasks SET creation_notified_at = NOW() WHERE id = $1';
      } else if (notificationType === 'DAY_START' && (allTokens.length > 0 || now.getHours() > 10)) {
        // Mark as day-start notified if tokens found OR if it's past 10 AM (don't retry all day)
        updateQuery = 'UPDATE communication_tasks SET day_start_notified_at = NOW() WHERE id = $1';
      } else if (notificationType === 'TEN_MIN') {
        // Ten min reminders are one-shot
        updateQuery = 'UPDATE communication_tasks SET ten_min_reminder_sent = true WHERE id = $1';
      } else if (notificationType === 'DUE') {
        await updateCommunicationTaskStatus(task.id, 'Notified', now);
      }

      if (updateQuery) {
        await db.query(updateQuery, params);
      }
    }
  } catch (err) {
    console.error('[COMM-SCHEDULER] Error processing communication tasks:', err);
  }
}

setInterval(processCommunicationTasks, 60 * 1000); // Check every minute for precision
processCommunicationTasks();