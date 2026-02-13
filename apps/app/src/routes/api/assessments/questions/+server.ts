import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const topicId = url.searchParams.get('topicId');
    const unitId = url.searchParams.get('unitId');

    try {
        let query = 'SELECT * FROM assessment_questions WHERE 1=1';
        const params = [];

        if (topicId) {
            params.push(topicId);
            query += ` AND topic_id = $${params.length}`;
        }

        if (unitId) {
            params.push(unitId);
            query += ` AND unit_id = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC';

        const { rows } = await db.query(query, params);
        return json(rows);
    } catch (err: any) {
        throw error(500, err.message);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if ((!body.topic_id && !body.unit_id) || !body.question_text) {
        throw error(400, 'Topic ID or Unit ID and Question Text are required');
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO assessment_questions (
                topic_id, unit_id, question_text, marks, type, options, 
                bloom_level, co_id, difficulty, image_url, explanation, answer_key, is_important
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                body.topic_id || null,
                body.unit_id || null,
                body.question_text,
                body.marks || 1,
                body.type || 'MCQ',
                JSON.stringify(body.options || []),
                body.bloom_level || null,
                body.co_id || null,
                body.difficulty || 'MEDIUM',
                body.image_url || null,
                body.explanation || null,
                body.answer_key || null,
                body.is_important || false
            ]
        );
        return json(rows[0]);
    } catch (err: any) {
        console.error('[QUESTIONS_POST] Error:', err);
        throw error(500, err.message);
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    if (!body.id) throw error(400, 'Question ID is required');

    try {
        // Build dynamic update query
        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        const fields = ['question_text', 'marks', 'type', 'options', 'bloom_level', 'co_id', 'difficulty', 'image_url', 'explanation', 'answer_key', 'is_important'];

        for (const field of fields) {
            if (body[field] !== undefined) {
                updates.push(`${field} = $${idx++}`);
                params.push(field === 'options' ? JSON.stringify(body[field]) : body[field]);
            }
        }

        if (updates.length === 0) return json({ error: 'No fields to update' });

        params.push(body.id);
        const query = `UPDATE assessment_questions SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;

        const { rows } = await db.query(query, params);
        return json(rows[0]);
    } catch (err: any) {
        console.error(err);
        throw error(500, err.message);
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'Question ID is required');

    try {
        await db.query('DELETE FROM assessment_questions WHERE id = $1', [id]);
        return json({ success: true });
    } catch (err: any) {
        throw error(500, err.message);
    }
};
