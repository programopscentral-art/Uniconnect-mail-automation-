import dotenv from 'dotenv';
import path from 'path';

// Load env only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Standardize env access for shared package
process.env.ENCRYPTION_KEY_BASE64 = process.env.ENCRYPTION_KEY_BASE64;

import { Worker, Queue, type Job } from 'bullmq';
import {
  db,
  getTemplateById,
  getMailboxCredentials,
  decryptString,
  TemplateRenderer,
  getTasksDueSoon,
  markReminderSent,
  createNotification
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

// Updates status of individual recipient
async function updateRecipientStatus(id: string, status: 'SENT' | 'FAILED', messageId?: string, error?: string) {
  await db.query(
    `UPDATE campaign_recipients SET status = $1, sent_at = NOW(), gmail_message_id = $2, error_message = $3, updated_at = NOW() WHERE id = $4`,
    [status, messageId, error, id]
  );
  // Update campaign stats
  if (status === 'SENT') {
    const res = await db.query(`SELECT campaign_id FROM campaign_recipients WHERE id = $1`, [id]);
    if (res.rows[0]) {
      await db.query(`UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1`, [res.rows[0].campaign_id]);
    }
  } else if (status === 'FAILED') {
    const res = await db.query(`SELECT campaign_id FROM campaign_recipients WHERE id = $1`, [id]);
    if (res.rows[0]) {
      await db.query(`UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1`, [res.rows[0].campaign_id]);
    }
  }
}

// 1. Email Campaign Worker
const worker = new Worker('email-sending', async (job: Job) => {
  const { recipientId, campaignId, email, trackingToken, templateId, mailboxId, variables } = job.data;
  console.log(`Processing job ${job.id} for ${email}`);

  try {
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
    const extendedVars = {
      ...variables,
      STUDENT_NAME: variables.studentName,
      ...(variables.metadata || {})
    };

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

// 2. System Notification Worker
const systemWorker = new Worker('system-notifications', async (job: Job) => {
  const { to, subject, text, html } = job.data;
  console.log(`[SYSTEM-NOTIF] Processing job ${job.id} for ${to}`);

  try {
    // 1. Try to find any connected mailbox to use for system notifications
    // This bypasses Port 587/465 blocks by using the Gmail API (Port 443)
    const mailboxRes = await db.query(
      `SELECT m.* FROM mailbox_connections m 
       JOIN users u ON m.email = u.email 
       WHERE u.role IN ('ADMIN', 'PROGRAM_OPS') AND m.status = 'ACTIVE'
       LIMIT 1`
    );

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

console.log('Worker started with Campaign, System, and Reminder support.');
