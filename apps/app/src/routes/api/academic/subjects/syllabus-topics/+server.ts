import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let _migrated = false;
async function ensureTable() {
    if (_migrated) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS subject_syllabus_topics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                topic_name TEXT NOT NULL,
                topic_order INTEGER DEFAULT 0,
                estimated_sessions INTEGER DEFAULT 1,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMPTZ,
                completed_by UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(subject_id, topic_name)
            )
        `);
        _migrated = true;
    } catch { _migrated = true; }
}

// GET /api/academic/subjects/syllabus-topics?subjectId=X
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

    const subjectId = url.searchParams.get('subjectId');
    if (!subjectId) throw error(400, 'subjectId is required');

    try {
        const result = await db.query(
            `SELECT id, subject_id, topic_name, topic_order, estimated_sessions, is_completed, completed_at
             FROM subject_syllabus_topics
             WHERE subject_id = $1
             ORDER BY topic_order ASC, topic_name ASC`,
            [subjectId]
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/subjects/syllabus-topics]', e.message);
        return json([]);
    }
};

// POST — add a new syllabus topic to a subject
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    await ensureTable();

    const { subject_id, topic_name, topic_order, estimated_sessions } = await request.json();
    if (!subject_id || !topic_name?.trim()) throw error(400, 'subject_id and topic_name are required');

    try {
        const result = await db.query(
            `INSERT INTO subject_syllabus_topics (subject_id, topic_name, topic_order, estimated_sessions)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (subject_id, topic_name) DO NOTHING
             RETURNING *`,
            [subject_id, topic_name.trim(), topic_order || 0, estimated_sessions || 1]
        );
        return json(result.rows[0] || { exists: true });
    } catch (e: any) {
        console.error('[POST /api/academic/subjects/syllabus-topics]', e.message);
        return json({ success: false, message: e.message }, { status: 500 });
    }
};
