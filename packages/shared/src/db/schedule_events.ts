import { db } from './client';

export interface ScheduleEvent {
    id: string;
    university_id: string;
    title: string;
    type: 'HOLIDAY' | 'EXAM' | 'EVENT';
    description: string | null;
    start_date: Date;
    due_date: Date;
    created_by: string | null;
    created_at: Date;
}

export async function createScheduleEvent(data: {
    university_id: string;
    title: string;
    type: 'HOLIDAY' | 'EXAM' | 'EVENT';
    description?: string;
    start_date: string;
    due_date: string;
    created_by: string;
}) {
    const result = await db.query(
        `INSERT INTO schedule_events (university_id, title, type, description, start_date, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.university_id, data.title, data.type, data.description || null, data.start_date, data.due_date, data.created_by]
    );
    return result.rows[0] as ScheduleEvent;
}

export async function getScheduleEvents(universityId?: string) {
    const whereClause = universityId ? `WHERE university_id = $1` : ``;
    const params = universityId ? [universityId] : [];
    const result = await db.query(
        `SELECT * FROM schedule_events ${whereClause} ORDER BY start_date ASC`,
        params
    );
    return result.rows as ScheduleEvent[];
}

export async function deleteScheduleEvent(id: string) {
    await db.query(`DELETE FROM schedule_events WHERE id = $1`, [id]);
}
