import { db, getCommunicationTasksForReminders, getUserFcmTokens, updateCommunicationTaskStatus, type CommunicationTask } from '@uniconnect/shared';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import path from 'path';

// Explicitly load root .env
const envPath = path.resolve(process.cwd(), '.env');
console.log(`[WORKER_INIT] 📁 Loading root env from: ${envPath}`);
dotenv.config({ path: envPath });

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Firebase initialization wrapper
  let firebaseInitialized = false;

  async function initFirebase() {
    if (firebaseInitialized) return;
    try {
      const b64 = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
      if (!b64) {
        console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found.');
        return;
      }

      const decoded = Buffer.from(b64.replace(/\s/g, ''), 'base64').toString('utf-8');
      // Robust JSON parsing: remove invalid escapes and corrupted control characters
      // Preserve \n (0x0A), \r (0x0D), \t (0x09) as they might be in the private key
      const sanitized = decoded
        .replace(/\\(?!([nrut"\\\/]|u[0-9a-fA-F]{4}))/g, '') // Remove bad escapes
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ''); // Remove most control characters, preserve 09, 0A, 0D
      const serviceAccount = JSON.parse(sanitized);

      // RECONSTRUCT PEM logic
      if (serviceAccount.private_key) {
        let pk = serviceAccount.private_key.replace(/\\n/g, '\n');
        const startMarker = '-----BEGIN PRIVATE KEY-----';
        const endMarker = '-----END PRIVATE KEY-----';
        if (pk.includes(startMarker)) {
          const startIdx = pk.indexOf(startMarker) + startMarker.length;
          let mid = pk.includes(endMarker) ? pk.substring(startIdx, pk.indexOf(endMarker)) : pk.substring(startIdx);
          mid = mid.replace(/[^A-Za-z0-9+/=]/g, '');
          serviceAccount.private_key = `${startMarker}\n${mid}\n${endMarker}\n`;
        }
      }

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

  async function processCommunicationTasks() {
    try {
      // Attempt Firebase init every cycle if not yet done
      if (!firebaseInitialized) await initFirebase();

      // SELF-HEALING: Reactivate the admin user if they are inactive
      await db.query(`UPDATE users SET is_active = true WHERE email = 'programopscentral@nxtwave.in' AND is_active = false`);

      const tasks = await getCommunicationTasksForReminders();
      if (tasks.length === 0) return;

      console.log(`[COMM-SCHEDULER] 🔔 Processing ${tasks.length} tasks for notifications. Firebase Apps: ${admin.apps.length}`);

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
          day_start_notified_at = CASE WHEN $3 = 'DAY_START' THEN $2 ELSE day_start_notified_at END,
          ten_min_reminder_sent = CASE WHEN $3 = 'TEN_MIN' THEN true ELSE ten_min_reminder_sent END,
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
          case 'DAY_START': title = 'Task Scheduled Today'; body = `Reminder: You have a ${task.channel} task due today at ${scheduledAt.toLocaleTimeString()}.`; break;
          case 'TEN_MIN': title = 'Task Due in 10 Min'; body = `Final Reminder: Prepare to send the ${task.channel} message.`; break;
          case 'DUE': title = 'Task Due Now'; body = `Action Required: Send ${task.channel} message for ${task.universities.join(', ')}.`; break;
        }

        // 3. Persist In-App Notification & Collect FCM Tokens
        for (const userId of uniqueRecipientIds) {
          // Persistent DB notification
          await db.query(`
          INSERT INTO notifications (user_id, title, message, type, link)
          VALUES ($1, $2, $3, 'SYSTEM', $4)
          ON CONFLICT DO NOTHING
        `, [userId, title, body, `/communication-tasks/${task.id}`]);

          // Accumulate FCM tokens
          const tokens = await getUserFcmTokens(userId);
          allTokens.push(...tokens);
        }

        // 4. Send Push Notifications via FCM
        if (allTokens.length > 0 && admin.apps.length > 0) {
          const message = {
            notification: { title, body },
            data: { taskId: task.id, action: 'OPEN_TASK' },
            tokens: allTokens
          };

          const response = await admin.messaging().sendEachForMulticast(message);
          console.log(`[COMM-SCHEDULER] Sent ${notificationType} push to ${response.successCount} users.`);
        }

        // Update DB state
        const taskAgeMinutes = (now.getTime() - new Date(task.created_at).getTime()) / (60000);
        const shouldMark = allTokens.length > 0 || taskAgeMinutes > 10;

        if (notificationType === 'CREATION' && shouldMark) {
          await db.query('UPDATE communication_tasks SET creation_notified_at = NOW() WHERE id = $1', [task.id]);
        } else if (notificationType === 'DAY_START' && (allTokens.length > 0 || now.getHours() > 22)) {
          await db.query('UPDATE communication_tasks SET day_start_notified_at = NOW() WHERE id = $1', [task.id]);
        } else if (notificationType === 'TEN_MIN') {
          await db.query('UPDATE communication_tasks SET ten_min_reminder_sent = true WHERE id = $1', [task.id]);
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
    }
  }

  // Check every minute
  setInterval(processCommunicationTasks, 60 * 1000);
  processCommunicationTasks();

  console.log('✅ Worker with robust notifications started.');
} else {
  console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found in environment.');
}