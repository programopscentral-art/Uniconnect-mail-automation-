import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    console.log(`[TEMPLATE_DELETE] 🗑️ Request to delete template: ${params.id}`);

    try {
        const { rows } = await db.query('SELECT * FROM assessment_templates WHERE id = $1', [params.id]);
        const t = rows[0];
        if (!t) {
            console.warn(`[TEMPLATE_DELETE] ⚠️ Template ${params.id} not found`);
            throw error(404, 'Template not found');
        }

        // RBAC Check
        if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
            console.error(`[TEMPLATE_DELETE] ❌ Forbidden: User ${locals.user.id} trying to delete template ${params.id}`);
            throw error(403, 'Forbidden');
        }

        await db.query('DELETE FROM assessment_templates WHERE id = $1', [params.id]);
        console.log(`[TEMPLATE_DELETE] ✅ Template ${params.id} successfully deleted`);

        return new Response(null, { status: 204 });
    } catch (e: any) {
        console.error(`[TEMPLATE_DELETE] ❌ Error deleting template:`, e);
        return json({
            success: false,
            message: e.message || 'Failed to delete template',
            detail: e.stack
        }, { status: e.status || 500 });
    }
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    console.log(`[TEMPLATE_PATCH] 📝 Request to update template: ${params.id}`);

    try {
        const { rows } = await db.query('SELECT * FROM assessment_templates WHERE id = $1', [params.id]);
        const t = rows[0];
        if (!t) throw error(404, 'Template not found');

        // RBAC Check
        if (locals.user.role === 'UNIVERSITY_OPERATOR' && t.university_id !== locals.user.university_id) {
            throw error(403, 'Forbidden');
        }

        const data = await request.json();

        // Ensure we don't accidentally update read-only fields
        delete data.id;
        delete data.university_id;

        // Build dynamic update query
        const updates: string[] = [];
        const queryParams: any[] = [];
        let idx = 1;

        const fields = ['name', 'slug', 'exam_type', 'status', 'layout_schema', 'background_image_url', 'regions', 'config', 'assets'];

        for (const field of fields) {
            if (data[field] !== undefined) {
                updates.push(`${field} = $${idx++}`);
                queryParams.push(['layout_schema', 'regions', 'config', 'assets'].includes(field) ? JSON.stringify(data[field]) : data[field]);
            }
        }

        if (updates.length === 0) return json({ error: 'No fields to update' });

        queryParams.push(params.id);
        const query = `UPDATE assessment_templates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;

        const { rows: updatedRows } = await db.query(query, queryParams);
        const updated = updatedRows[0];
        console.log(`[TEMPLATE_PATCH] ✅ Template ${params.id} successfully updated`);

        return json(updated);
    } catch (e: any) {
        console.error(`[TEMPLATE_PATCH] ❌ Error updating template:`, e);
        return json({
            success: false,
            message: e.message || 'Failed to update template',
            detail: e.stack
        }, { status: e.status || 500 });
    }
};
