import { db } from './client';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SupportTicket {
    id: string;
    university_id: string;
    created_by_user_id: string;
    assigned_to_user_id: string | null;
    title: string;
    description: string;
    category: string;
    priority: TicketPriority;
    status: TicketStatus;
    metadata: any;
    created_at: Date;
    updated_at: Date;
}

export interface Attachment {
    id: string;
    entity_type: string;
    entity_id: string;
    file_name: string;
    file_path: string;
    file_type: string | null;
    file_size: number | null;
    uploaded_by_user_id: string | null;
    created_at: Date;
}

export async function createTicket(data: any) {
    const result = await db.query(
        `INSERT INTO support_tickets (university_id, created_by_user_id, title, description, category, priority, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.university_id, data.created_by_user_id, data.title, data.description, data.category, data.priority || 'MEDIUM', 'OPEN']
    );
    return result.rows[0] as SupportTicket;
}

export async function getTickets(universityId: string, status?: TicketStatus) {
    let query = `SELECT t.*, u.name as creator_name, a.name as assignee_name 
                 FROM support_tickets t
                 JOIN users u ON t.created_by_user_id = u.id
                 LEFT JOIN users a ON t.assigned_to_user_id = a.id
                 WHERE t.university_id = $1`;
    const params: any[] = [universityId];

    if (status) {
        query += ` AND t.status = $2`;
        params.push(status);
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);
    return result.rows;
}

export async function addActivity(data: { entity_type: string; entity_id: string; user_id: string; activity_type: string; content?: string; metadata?: any }) {
    await db.query(
        `INSERT INTO entity_activities (entity_type, entity_id, user_id, activity_type, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.entity_type, data.entity_id, data.user_id, data.activity_type, data.content || null, data.metadata || {}]
    );
}
