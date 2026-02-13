import { db, getCommunicationTasksForReminders, getUserFcmTokens, updateCommunicationTaskStatus, type CommunicationTask } from '@uniconnect/shared';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import path from 'path';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

// Explicitly load root .env
const envPath = path.resolve(process.cwd(), '.env');
console.log(`[WORKER_INIT] 📁 Loading root env from: ${envPath}`);
dotenv.config({ path: envPath });

// Firebase initialization wrapper
let firebaseInitialized = false;

async function initFirebase() {
  if (firebaseInitialized) return;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!b64) {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found in environment.');
    return;
  }

  try {
    console.log(`[FIREBASE_INIT] ⚙️ Found env variable, length: ${b64.length}`);
    const serviceAccount = JSON.parse(
      Buffer.from(b64, 'base64').toString('utf-8')
    );

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized successfully.');
    }
    firebaseInitialized = true;
  } catch (err) {
    console.error('❌ Firebase Init Failed:', err);
  }
}

let isProcessing = false;

async function processCommunicationTasks() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // Attempt Firebase init every cycle if not yet done
    if (!firebaseInitialized) await initFirebase();

    // SELF-HEALING: Reactivate the admin user if they are inactive
    await db.query(`UPDATE users SET is_active = true WHERE email = 'programopscentral@nxtwave.in' AND is_active = false`);

    const tasks = await getCommunicationTasksForReminders();
    if (tasks.length === 0) return;

    console.log(`[COMM-SCHEDULER] 🔔 Found ${tasks.length} tasks ready for check. Time: ${new Date().toLocaleTimeString()}`);

    for (const task of tasks) {
      let notificationType: 'CREATION' | 'TEN_MIN' | 'DUE' | 'OVERDUE_10' | 'OVERDUE_30' | null = null;
      const now = new Date();
      const scheduledAt = new Date(task.scheduled_at);

      // A. CREATION ALERT (Unnotified at creation)
      if (!task.creation_notified_at) {
        notificationType = 'CREATION';
      }
      // B. DUE NOW (Status: Scheduled, time passed or within 60s)
      else if (task.status === 'Scheduled' && scheduledAt.getTime() <= now.getTime() + 60000) {
        notificationType = 'DUE';
      }
      // C. 10 MIN REMINDER (Scheduled, within 10-12 mins, not sent)
      else if (task.status === 'Scheduled' && !task.ten_min_reminder_sent && (scheduledAt.getTime() - now.getTime()) <= 10.5 * 60 * 1000 && (scheduledAt.getTime() - now.getTime()) > 0) {
        notificationType = 'TEN_MIN';
      }
      // D. OVERDUE 10 MIN (Notified, but not completed, 10+ mins past)
      else if (task.status === 'Notified' && !task.overdue_10min_notified_at && (now.getTime() - scheduledAt.getTime()) >= 10 * 60 * 1000 && (now.getTime() - scheduledAt.getTime()) < 30 * 60 * 1000) {
        notificationType = 'OVERDUE_10';
      }
      // E. OVERDUE 30 MIN (Notified, but not completed, 30+ mins past)
      else if (task.status === 'Notified' && !task.overdue_30min_notified_at && (now.getTime() - scheduledAt.getTime()) >= 30 * 60 * 1000) {
        notificationType = 'OVERDUE_30';
      }

      if (!notificationType) continue;

      const allTokensSet = new Set<string>();

      // 1. Get all users associated with these universities + all Global Admins
      const usersRes = await db.query(
        `SELECT DISTINCT u.id
         FROM users u
         LEFT JOIN user_universities uu ON u.id = uu.user_id
         LEFT JOIN universities un ON (u.university_id = un.id OR uu.university_id = un.id)
         WHERE u.is_active = true 
         AND (
           u.role = 'ADMIN' OR
           un.id::text = ANY($1::text[]) OR 
           un.name = ANY($1::text[]) OR 
           un.short_name = ANY($1::text[])
         )`,
        [task.universities]
      );

      const recipientIds = usersRes.rows.map(r => r.id);

      if (recipientIds.length === 0) {
        console.log(`[COMM-SCHEDULER] ⚠️ No recipients for task ${task.id}. Marking as processed to avoid infinite loop.`);
        // Update flags so we don't keep trying
        const now = new Date();
        await db.query(`UPDATE communication_tasks SET 
          creation_notified_at = COALESCE(creation_notified_at, $2),
          ten_min_reminder_sent = CASE WHEN $3 = 'TEN_MIN' THEN true ELSE ten_min_reminder_sent END,
          overdue_10min_notified_at = CASE WHEN $3 = 'OVERDUE_10' THEN $2 ELSE overdue_10min_notified_at END,
          overdue_30min_notified_at = CASE WHEN $3 = 'OVERDUE_30' THEN $2 ELSE overdue_30min_notified_at END,
          status = CASE WHEN $3 = 'DUE' THEN 'Notified' ELSE status END
          WHERE id = $1`, [task.id, now, notificationType]);
        continue;
      }

      // Also include any specifically assigned staff (if any)
      if (task.assigned_to && task.assigned_to.length > 0) {
        recipientIds.push(...task.assigned_to);
      }

      const uniqueRecipientIds = [...new Set(recipientIds)];

      // 2. Prepare Notification Content
      let title = '';
      let body = '';
      switch (notificationType) {
        case 'CREATION': title = 'New Task Assigned'; body = `A new ${task.channel} task for ${task.universities.join(', ')} scheduled for ${scheduledAt.toLocaleString()}.`; break;
        case 'TEN_MIN': title = 'Task Due in 10 Min'; body = `Final Reminder: Prepare to send the ${task.channel} message.`; break;
        case 'DUE': title = 'Task Due Now'; body = `Action Required: Send ${task.channel} message for ${task.universities.join(', ')}.`; break;
        case 'OVERDUE_10': title = 'Task Overdue (10m)'; body = `The ${task.channel} task is 10 minutes past deadline and still not marked as completed!`; break;
        case 'OVERDUE_30': title = 'CRITICAL: Task Overdue (30m)'; body = `The ${task.channel} task is 30 minutes past deadline! Take immediate action.`; break;
      }

      // 3. Persist In-App Notification & Collect FCM Tokens
      const sourceId = `CT_${task.id}_${notificationType}`;
      for (const userId of uniqueRecipientIds) {
        // Persistent DB notification with source deduplication
        await db.query(`
          INSERT INTO notifications (user_id, title, message, type, link, source_id)
          VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
          ON CONFLICT (user_id, source_id) WHERE source_id IS NOT NULL DO NOTHING
        `, [userId, title, body, `/communication-tasks/${task.id}`, sourceId]);

        // Accumulate FCM tokens
        const tokens = await getUserFcmTokens(userId);
        tokens.forEach(t => allTokensSet.add(t));
      }

      const allTokens = [...allTokensSet];

      // 4. Send Push Notifications via FCM
      if (allTokens.length > 0 && admin.apps.length > 0) {
        // Double check task status hasn't changed to Completed in the last few ms
        const freshTask = await db.query('SELECT status FROM communication_tasks WHERE id = $1', [task.id]);
        if (freshTask.rows[0]?.status === 'Completed') {
          console.log(`[COMM-SCHEDULER] Skipping push for Task ${task.id} as it is now COMPLETED.`);
          continue;
        }

        const message = {
          notification: { title, body },
          data: {
            taskId: String(task.id),
            action: 'OPEN_TASK',
            sourceId: String(sourceId)
          },
          tokens: allTokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[COMM-SCHEDULER] Sent ${notificationType} push for task ${task.id}. Success: ${response.successCount}, Failure: ${response.failureCount}. Tokens used: ${allTokens.length}`);
      } else {
        console.log(`[COMM-SCHEDULER] ⚠️ Skipping push for ${notificationType} (Task ${task.id}). Tokens: ${allTokens.length}, Firebase App: ${admin.apps.length > 0}`);
      }

      // Update DB state
      const taskAgeMinutes = (now.getTime() - new Date(task.created_at).getTime()) / (60000);
      const shouldMark = allTokens.length > 0 || taskAgeMinutes > 10;

      if (notificationType === 'CREATION' && shouldMark) {
        await db.query('UPDATE communication_tasks SET creation_notified_at = NOW() WHERE id = $1', [task.id]);
      } else if (notificationType === 'TEN_MIN') {
        await db.query('UPDATE communication_tasks SET ten_min_reminder_sent = true WHERE id = $1', [task.id]);
      } else if (notificationType === 'OVERDUE_10') {
        await db.query('UPDATE communication_tasks SET overdue_10min_notified_at = NOW() WHERE id = $1', [task.id]);
      } else if (notificationType === 'OVERDUE_30') {
        await db.query('UPDATE communication_tasks SET overdue_30min_notified_at = NOW() WHERE id = $1', [task.id]);
      } else if (notificationType === 'DUE') {
        await updateCommunicationTaskStatus(task.id, 'Notified', now);
      }
    }

    // AUDIT: Log recent notifications to verify reach
    const auditRes = await db.query(`
      SELECT n.title, u.email, u.role, n.created_at 
      FROM notifications n 
      JOIN users u ON n.user_id = u.id 
      ORDER BY n.created_at DESC 
      LIMIT 10
    `);
    if (auditRes.rows.length > 0) {
      console.log('[COMM-SCHEDULER] 🕵️ Recent Notifications Audit:');
      for (const r of auditRes.rows) {
        console.log(`  - [${r.role}] ${r.email}: ${r.title} (${r.created_at.toISOString()})`);
      }
    }
  } catch (err) {
    console.error('[COMM-SCHEDULER] Error:', err);
  } finally {
    isProcessing = false;
  }
}

// Check every minute
// Check every 30 seconds for better responsiveness
setInterval(processCommunicationTasks, 30 * 1000);
processCommunicationTasks();

// BULLMQ: Listen for instant triggers from the main app
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

const worker = new Worker('comm-task-notifications', async (job) => {
  if (job.name === 'check-tasks') {
    console.log('[WORKER] 🚀 Received instant trigger for communication tasks.');
    await processCommunicationTasks();
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[WORKER] ❌ Job ${job?.id} failed:`, err);
});

console.log('✅ Worker with robust notifications and BullMQ sync started.');