import { db } from '../db/client';
import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
    if (_transporter) return _transporter;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return null;

    _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
    return _transporter;
}

export class AccessAlertService {
    /**
     * Send an alert to all ADMIN users when sensitive data is accessed.
     * Creates in-app notification + sends email if SMTP is configured.
     * Throttled: max 1 alert per accessor per student per 15 minutes.
     */
    static async sendAccessAlert(params: {
        accessorId: string;
        accessorName: string;
        accessorEmail: string;
        studentProfileId: string;
        studentName: string;
        accessType: 'PII_ACCESS' | 'DOCUMENT_DOWNLOAD' | 'DOCUMENT_DELETE' | 'SCREENSHOT_ATTEMPT';
        details?: string;
        ipAddress?: string;
    }): Promise<void> {
        try {
            // Only throttle if we have a valid student profile ID (not placeholder)
            const hasValidStudent = params.studentProfileId &&
                params.studentProfileId !== '00000000-0000-0000-0000-000000000000';

            if (hasValidStudent) {
                // Check throttle
                const throttleCheck = await db.query(
                    `SELECT last_alerted_at FROM access_alert_throttle
                     WHERE accessor_id = $1 AND student_profile_id = $2
                     AND last_alerted_at > NOW() - INTERVAL '15 minutes'`,
                    [params.accessorId, params.studentProfileId]
                );

                if (throttleCheck.rows.length > 0) return; // Throttled

                // Upsert throttle entry
                await db.query(
                    `INSERT INTO access_alert_throttle (accessor_id, student_profile_id, last_alerted_at)
                     VALUES ($1, $2, NOW())
                     ON CONFLICT (accessor_id, student_profile_id)
                     DO UPDATE SET last_alerted_at = NOW()`,
                    [params.accessorId, params.studentProfileId]
                );
            }

            // Get all admin users to notify
            const admins = await db.query(
                "SELECT id, email, name FROM users WHERE role IN ('ADMIN', 'PROGRAM_OPS') AND is_active = true"
            );

            if (admins.rows.length === 0) return;

            const accessTypeLabel = {
                PII_ACCESS: 'viewed PII data',
                DOCUMENT_DOWNLOAD: 'downloaded a document',
                DOCUMENT_DELETE: 'deleted a document',
                SCREENSHOT_ATTEMPT: 'attempted a screenshot'
            }[params.accessType];

            const message = `${params.accessorName} (${params.accessorEmail}) ${accessTypeLabel} for student ${params.studentName}${params.details ? ` — ${params.details}` : ''}${params.ipAddress ? ` [IP: ${params.ipAddress}]` : ''}`;
            const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

            // Insert in-app notification + send email for each admin
            for (const admin of admins.rows) {
                try {
                    // In-app notification
                    await db.query(
                        `INSERT INTO notifications (user_id, title, message, type, metadata_json)
                         VALUES ($1, $2, $3, 'SECURITY_ALERT', $4)`,
                        [
                            admin.id,
                            'Sensitive Data Access Alert',
                            message,
                            JSON.stringify({
                                accessor_id: params.accessorId,
                                student_profile_id: params.studentProfileId,
                                access_type: params.accessType,
                                timestamp: new Date().toISOString()
                            })
                        ]
                    );

                    // Send email alert
                    const transporter = getTransporter();
                    if (transporter && admin.email) {
                        transporter.sendMail({
                            from: `"UniConnect Security" <${process.env.SMTP_USER}>`,
                            to: admin.email,
                            subject: `🔒 Security Alert: ${params.accessType.replace(/_/g, ' ')}`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
                                        <h2 style="margin: 0;">Sensitive Data Access Alert</h2>
                                    </div>
                                    <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Who</td><td style="padding: 8px 0;">${params.accessorName} (${params.accessorEmail})</td></tr>
                                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Action</td><td style="padding: 8px 0;">${accessTypeLabel}</td></tr>
                                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Student</td><td style="padding: 8px 0;">${params.studentName}</td></tr>
                                            ${params.details ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Details</td><td style="padding: 8px 0;">${params.details}</td></tr>` : ''}
                                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Time</td><td style="padding: 8px 0;">${timestamp}</td></tr>
                                            ${params.ipAddress ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">IP Address</td><td style="padding: 8px 0;">${params.ipAddress}</td></tr>` : ''}
                                        </table>
                                        <p style="margin-top: 20px; color: #9ca3af; font-size: 12px;">This is an automated security alert from UniConnect. You are receiving this because you are an administrator.</p>
                                    </div>
                                </div>
                            `
                        }).catch(() => {}); // Fire-and-forget, don't block
                    }
                } catch {
                    // Individual notification failure shouldn't block others
                }
            }
        } catch (err) {
            console.error('[ACCESS_ALERT] Failed to send alert:', err);
        }
    }
}
