import { db } from '../db/client';

export interface ActivityLogInput {
    university_id: string;
    actor_id: string;
    action_type: string;
    entity_type: string;
    entity_id?: string;
    before_state?: any;
    after_state?: any;
    ip_address?: string;
    user_agent?: string;
}

export class ActivityService {
    /**
     * Records a system activity for compliance and auditing.
     */
    static async log(input: ActivityLogInput) {
        try {
            await db.query(
                `INSERT INTO system_activity_logs (
                    university_id, actor_id, action_type, entity_type, 
                    entity_id, before_state, after_state, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    input.university_id,
                    input.actor_id,
                    input.action_type,
                    input.entity_type,
                    input.entity_id || null,
                    JSON.stringify(input.before_state || {}),
                    JSON.stringify(input.after_state || {}),
                    input.ip_address || null,
                    input.user_agent || null
                ]
            );
        } catch (error) {
            console.error('Failed to log activity:', error);
            // We don't throw error here to avoid breaking the main business flow
        }
    }

    /**
     * Fetches activity logs for a specific university.
     */
    static async getLogs(universityId: string, limit = 50, offset = 0) {
        const result = await db.query(
            `SELECT l.*, u.name as actor_name, u.email as actor_email
             FROM system_activity_logs l
             LEFT JOIN users u ON l.actor_id = u.id
             WHERE l.university_id = $1
             ORDER BY l.created_at DESC
             LIMIT $2 OFFSET $3`,
            [universityId, limit, offset]
        );
        return result.rows;
    }
}
