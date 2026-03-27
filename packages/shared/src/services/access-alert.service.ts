import { db } from '../db/client';

export class AccessAlertService {
    /**
     * Send an email alert to all ADMIN users when sensitive data is accessed.
     * Throttled: max 1 alert per accessor per student per 15 minutes.
     * This is fire-and-forget — failures don't block the main flow.
     */
    static async sendAccessAlert(params: {
        accessorId: string;
        accessorName: string;
        accessorEmail: string;
        studentProfileId: string;
        studentName: string;
        accessType: 'PII_ACCESS' | 'DOCUMENT_DOWNLOAD' | 'DOCUMENT_DELETE';
        details?: string;
        ipAddress?: string;
    }): Promise<void> {
        try {
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

            // Get all admin users to notify
            const admins = await db.query(
                "SELECT id, email, name FROM users WHERE role IN ('ADMIN', 'PROGRAM_OPS') AND is_active = true"
            );

            if (admins.rows.length === 0) return;

            // Store the alert as a notification for each admin
            const accessTypeLabel = {
                PII_ACCESS: 'viewed PII data',
                DOCUMENT_DOWNLOAD: 'downloaded a document',
                DOCUMENT_DELETE: 'deleted a document'
            }[params.accessType];

            const message = `${params.accessorName} (${params.accessorEmail}) ${accessTypeLabel} for student ${params.studentName}${params.details ? ` — ${params.details}` : ''}${params.ipAddress ? ` [IP: ${params.ipAddress}]` : ''}`;

            // Insert notification for each admin
            for (const admin of admins.rows) {
                try {
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
                } catch {
                    // Individual notification failure shouldn't block others
                }
            }
        } catch (err) {
            console.error('[ACCESS_ALERT] Failed to send alert:', err);
        }
    }
}
