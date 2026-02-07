import { json, error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const POST = async ({ params, locals }: { params: { id: string }, locals: any }) => {
    if (!locals.user) throw error(401);
    const { id } = params;

    if (!id) throw error(400, 'ID is required');

    // Verify source exists and user has access
    const { rows } = await db.query('SELECT * FROM assessment_templates WHERE id = $1', [id]);
    const existing = rows[0];
    if (!existing) throw error(404, 'Source template not found');

    // Admins can clone across universities, Operators can only clone their own
    if (locals.user.role !== 'ADMIN' && existing.university_id !== locals.user.university_id) {
        throw error(403, 'Unauthorized: Cannot clone template from another university');
    }

    try {
        // Clone the template by creating a new one with copied data
        const { rows: clonedRows } = await db.query(
            `INSERT INTO assessment_templates (
                university_id, name, slug, exam_type, status, layout_schema,
                background_image_url, regions, config, assets, created_by
            )
            SELECT $1, $2, $3, exam_type, 'draft', layout_schema,
                background_image_url, regions, config, assets, $4
            FROM assessment_templates
            WHERE id = $5
            RETURNING *`,
            [
                locals.user.university_id,
                `${existing.name} (Copy)`,
                `${existing.slug}-copy-${Date.now()}`,
                locals.user.id,
                id
            ]
        );
        const cloned = clonedRows[0];

        console.log(`[TEMPLATE_CLONE] 🚀 Template ${id} cloned to ${cloned.id} for Uni ${cloned.university_id}`);

        return json(cloned);
    } catch (e: any) {
        console.error(`[TEMPLATE_CLONE] ❌ Error:`, e);
        throw error(500, e.message || 'Failed to clone template');
    }
};
