import { db } from './client';

export interface DayPlanItem {
    id: string;
    user_id: string;
    title: string;
    plan_date: string;
    completed: boolean;
    completed_at: string | null;
    google_sheet_url: string | null;
    created_at: string;
    updated_at: string;
}

export async function getDayPlans(userId: string, date?: string) {
    const query = date
        ? 'SELECT * FROM day_plans WHERE user_id = $1 AND plan_date = $2 ORDER BY created_at DESC'
        : 'SELECT * FROM day_plans WHERE user_id = $1 ORDER BY plan_date DESC, created_at DESC';
    const params = date ? [userId, date] : [userId];
    const { rows } = await db.query(query, params);
    return rows as DayPlanItem[];
}

export async function createDayPlan(data: Partial<DayPlanItem>) {
    const { user_id, title, plan_date, google_sheet_url } = data;
    const date = plan_date || new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
        `INSERT INTO day_plans (user_id, title, plan_date, google_sheet_url) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [user_id, title, date, google_sheet_url]
    );
    return rows[0] as DayPlanItem;
}

export async function updateDayPlan(id: string, updates: Partial<DayPlanItem>) {
    const { title, completed, google_sheet_url } = updates;

    let query = 'UPDATE day_plans SET updated_at = NOW()';
    const params: any[] = [id];
    let paramIndex = 2;

    if (title !== undefined) {
        query += `, title = $${paramIndex++}`;
        params.push(title);
    }
    if (completed !== undefined) {
        query += `, completed = $${paramIndex++}, completed_at = $${completed ? 'NOW()' : 'NULL'}`;
        params.push(completed);
    }
    if (google_sheet_url !== undefined) {
        query += `, google_sheet_url = $${paramIndex++}`;
        params.push(google_sheet_url);
    }

    query += ' WHERE id = $1 RETURNING *';
    const { rows } = await db.query(query, params);
    return rows[0] as DayPlanItem;
}

export async function deleteDayPlan(id: string) {
    await db.query('DELETE FROM day_plans WHERE id = $1', [id]);
}
