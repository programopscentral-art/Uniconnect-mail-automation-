import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DeterministicRenderer } from '$lib/server/services/deterministic-renderer';

export const GET: RequestHandler = async ({ params, url, locals }: any) => {
    if (!locals.user) throw error(401);

    const { id } = params;
    const setName = url.searchParams.get('set') || 'A';

    try {
        // 1. Fetch Paper
        const { rows: papers } = await db.query(
            `SELECT p.*, t.layout_schema 
             FROM assessment_papers p
             LEFT JOIN assessment_templates t ON p.template_id = t.id
             WHERE p.id = $1`,
            [id]
        );

        if (papers.length === 0) throw error(404, 'Paper not found');
        const paper = papers[0];

        // 2. Check if we have a Canonical Template
        if (!paper.layout_schema || !paper.layout_schema.slots) {
            return json({
                success: false,
                message: 'This paper does not use a deterministic template (Canonical Format missing). Please use standard print.'
            }, { status: 400 });
        }

        // 3. Prepare Data for Renderer
        const setsData = typeof paper.sets_data === 'string' ? JSON.parse(paper.sets_data) : paper.sets_data;
        const setData = setsData[setName] || setsData[setName.toLowerCase()];
        if (!setData) throw error(404, `Set ${setName} not found in paper`);

        const renderData: Record<string, string> = {};

        // Map questions to slots
        setData.questions.forEach((slot: any) => {
            if (!slot.slot_id) return;

            if (slot.type === 'OR_GROUP') {
                // For OR groups, we typically fill based on the specific selection or joined text
                const q1 = slot.choice1?.questions?.[0]?.text || '';
                const q2 = slot.choice2?.questions?.[0]?.text || '';
                renderData[slot.slot_id] = q1 + (q2 ? ` \nOR\n ` + q2 : '');
            } else {
                const q = slot.questions?.[0]?.text || '';
                renderData[slot.slot_id] = q;
            }
        });

        // Add Metadata (exam title, date, etc)
        const meta = setsData.metadata || setsData.editor_metadata || {};
        renderData['exam_title'] = meta.exam_title || paper.exam_title || '';
        renderData['subject_name'] = paper.subject_name || meta.subject_name || '';
        renderData['max_marks'] = String(paper.max_marks || meta.max_marks || '');
        renderData['duration'] = String(paper.duration_minutes || meta.duration_minutes || '');
        renderData['course_code'] = meta.course_code || '';
        renderData['paper_date'] = meta.paper_date || '';

        // 4. Render
        const pdfBuffer = await DeterministicRenderer.renderToBuffer(paper.layout_schema, renderData);

        return new Response(new Uint8Array(pdfBuffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="assessment_${id}_set_${setName}.pdf"`
            }
        });
    } catch (err: any) {
        console.error('[V94_RENDER_API] ❌ Render Error:', err);
        throw error(500, err.message);
    }
};
