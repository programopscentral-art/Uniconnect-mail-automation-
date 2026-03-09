import { db } from '../db/client';

export interface NotificationInput {
    university_id: string;
    recipient_id: string;
    recipient_email: string;
    title: string;
    body: string;
    link?: string;
    channels?: ('EMAIL' | 'IN_APP' | 'WHATSAPP')[];
}

export class NotificationService {
    /**
     * Unified Notification Dispatcher.
     * Routes notifications to the appropriate channels based on university config.
     */
    static async send(input: NotificationInput) {
        const channels = input.channels || ['EMAIL', 'IN_APP'];

        for (const channel of channels) {
            try {
                if (channel === 'IN_APP') {
                    await this.sendInApp(input);
                } else if (channel === 'EMAIL') {
                    await this.sendEmail(input);
                }
            } catch (err) {
                console.error(`Failed to send ${channel} notification to ${input.recipient_email}:`, err);
            }
        }
    }

    /**
     * Send persistent notification in the database for the app UI.
     */
    static async sendInApp(input: NotificationInput) {
        await db.query(
            `INSERT INTO notifications (user_id, university_id, title, message, link, status)
             VALUES ($1, $2, $3, $4, $5, 'UNREAD')`,
            [input.recipient_id, input.university_id, input.title, input.body, input.link || null]
        );
    }

    /**
     * Sends an email via the shared email service or SES.
     */
    static async sendEmail(input: NotificationInput) {
        // Assume email service is already implemented in the worker or a separate helper
        // This is a placeholder for the logic to queue the mail job in BullMQ
        console.log(`[EMAIL DISPATCH] To: ${input.recipient_email}, Subject: ${input.title}`);
    }

    /**
     * Notifies all relevant users about a scheduled event (e.g. Timetable Published).
     */
    static async notifyBulk(universityId: string, roleCode: string, title: string, body: string, link?: string) {
        const result = await db.query(
            `SELECT u.id, u.email 
             FROM users u
             INNER JOIN user_role_assignments ura ON u.id = ura.user_id
             INNER JOIN roles r ON ura.role_id = r.id
             WHERE ura.university_id = $1 AND r.code = $2 AND u.is_active = true`,
            [universityId, roleCode]
        );

        for (const user of result.rows) {
            await this.send({
                university_id: universityId,
                recipient_id: user.id,
                recipient_email: user.email,
                title,
                body,
                link
            });
        }
    }
}
