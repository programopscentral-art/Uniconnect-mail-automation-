import { json, error } from '@sveltejs/kit';
import { createAssessmentTemplate } from '@uniconnect/shared';

export const POST = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const examType = formData.get('examType') as string;
    const universityId = (formData.get('universityId') as string) || locals.user.university_id;
    const file = formData.get('file') as File;
    const logoFile = formData.get('logo') as File;

    if (!file || !name) throw error(400, 'Name and Source File are required');

    // In a real implementation, we would:
    // 1. Upload the files to Supabase Storage
    // 2. Process the file (PDF/Image) using an LLM or OCR to detect layout
    // 3. Generate a draft layout_schema and config

    console.log(`[TEMPLATE_IMPORT] 📥 Received file: ${file.name} for Uni: ${universityId}`);

    // Mock layout_schema generation
    const mockLayout = {
        universityName: locals.user.university_name || 'NEW UNIVERSITY',
        logoUrl: '', // Would be the uploaded logo URL
        headerStyle: 'split',
        primaryColor: '#000000'
    };

    // Default structure (can be edited later in the visual builder)
    const defaultConfig = [
        {
            part: 'A', title: 'PART A', answered_count: 5, marks_per_q: 2,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `A-${i}-${Math.random()}`, label: `${i + 1}`, type: 'SINGLE', marks: 2, unit: 'Auto', qType: 'NORMAL'
            }))
        }
    ];

    try {
        const template = await createAssessmentTemplate({
            university_id: universityId,
            name: name,
            exam_type: examType || 'MID',
            status: 'draft',
            layout_schema: mockLayout,
            config: defaultConfig,
            created_by: locals.user.id
        });

        return json({
            success: true,
            template,
            message: 'Template imported as draft. You can now customize it in the builder.'
        });
    } catch (e: any) {
        console.error(`[TEMPLATE_IMPORT] ❌ Error:`, e);
        throw error(500, e.message || 'Failed to import template');
    }
};
