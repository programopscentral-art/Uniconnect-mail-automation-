import { json, error } from '@sveltejs/kit';
import { createAssessmentTemplate } from '@uniconnect/shared';
import { z } from 'zod';

// Zod Schema for Layout Validation
const LayoutElementSchema = z.object({
    id: z.string(),
    type: z.enum(['text', 'image', 'table', 'shape']),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    content: z.string().optional(),
    src: z.string().optional(),
    styles: z.record(z.any()).optional(),
    tableData: z.any().optional()
});

const LayoutSchema = z.object({
    pages: z.array(z.object({
        id: z.string(),
        elements: z.array(LayoutElementSchema)
    }))
});

export const POST = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const exam_type = (formData.get('exam_type') || formData.get('examType') || 'MID1') as string;
    const universityId = (formData.get('universityId') as string) || locals.user.university_id;
    const file = formData.get('file') as File;
    const logoFile = formData.get('logo') as File;

    if (!file || !name) throw error(400, 'Name and Source File are required');

    console.log(`[TEMPLATE_IMPORT] 📥 Processing file: ${file.name} for Uni: ${universityId}`);

    // --- Layout Extraction Simulation ---
    // In a production environment, this would call an OCR/Layout detection service (e.g. AWS Textract, Azure Document Intelligence, or a custom ML model)
    // we'll simulate the extraction results based on the file type/name or just return a high-quality boilerplate if specific detection logic is missing
    const detectedLayout = await extractLayoutFromFile(file, name, exam_type);

    // Validate the extracted layout
    const validation = LayoutSchema.safeParse(detectedLayout);
    if (!validation.success) {
        console.error('[TEMPLATE_IMPORT] ❌ Validation Failed:', validation.error);
        throw error(422, 'Extracted layout is invalid');
    }

    // Default Configuration for slots
    const defaultConfig = [
        {
            id: 'part-a',
            title: 'PART A - Short Questions',
            marks_per_q: 2,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `A-${i}-${crypto.randomUUID().split('-')[0]}`, label: `${i + 1}`, type: 'SINGLE', marks: 2
            }))
        },
        {
            id: 'part-b',
            title: 'PART B - Long Questions',
            marks_per_q: 10,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `B-${i}-${crypto.randomUUID().split('-')[0]}`, label: `${i + 6}`, type: 'OR_GROUP', marks: 10,
                choices: [
                    { id: `B-${i}-a`, label: `${i + 6} (a)`, marks: 10 },
                    { id: `B-${i}-b`, label: `${i + 6} (b)`, marks: 10 }
                ]
            }))
        }
    ];

    try {
        const template = await createAssessmentTemplate({
            university_id: universityId,
            name: name,
            exam_type: exam_type,
            status: 'draft',
            layout_schema: validation.data,
            config: defaultConfig,
            created_by: locals.user.id
        });

        return json({
            success: true,
            template,
            message: 'Template layout detected and imported as draft. Review it in Design Studio.'
        });
    } catch (e: any) {
        console.error(`[TEMPLATE_IMPORT] ❌ Db Error:`, e);
        throw error(500, e.message || 'Failed to save imported template');
    }
};

/**
 * Simulates a high-fidelity layout extraction process.
 */
async function extractLayoutFromFile(file: File, name: string, examType: string) {
    // Boilerplate detection results that mimic a real "University Header + Info + Table" structure
    return {
        pages: [
            {
                id: 'p1',
                elements: [
                    {
                        id: 'uni-header',
                        type: 'text',
                        x: 20, y: 15, w: 170, h: 25,
                        content: `<div style="text-align: center;"><p style="font-size: 24px; font-weight: 900; margin: 0;">${name.toUpperCase()}</p><p style="font-size: 14px; margin-top: 5px; opacity: 0.7;">${examType} - EXAMINATION PAPER STRUCTURE</p></div>`,
                        styles: { fontFamily: 'Outfit, sans-serif' }
                    },
                    {
                        id: 'meta-table',
                        type: 'table',
                        x: 20, y: 70, w: 170, h: 40,
                        tableData: {
                            rows: [
                                { id: 'r1', cells: [{ id: 'c1', content: '<strong>Course Title</strong>', styles: {} }, { id: 'c2', content: '...', styles: {} }, { id: 'c3', content: '<strong>Code</strong>', styles: {} }, { id: 'c4', content: '...', styles: {} }] },
                                { id: 'r2', cells: [{ id: 'c1', content: '<strong>Max Marks</strong>', styles: {} }, { id: 'c2', content: '100', styles: {} }, { id: 'c3', content: '<strong>Duration</strong>', styles: {} }, { id: 'c4', content: '3 Hours', styles: {} }] }
                            ]
                        },
                        styles: {}
                    },
                    {
                        id: 'instructions',
                        type: 'text',
                        x: 25, y: 120, w: 160, h: 30,
                        content: `<p><strong>INSTRUCTIONS:</strong></p><ul><li>Answer all questions in Part A.</li><li>Answer any five questions from Part B.</li><li>Graph sheets and data tables may be provided on request.</li></ul>`,
                        styles: { fontSize: 11, lineHeight: 1.4 }
                    }
                ]
            }
        ]
    };
}
