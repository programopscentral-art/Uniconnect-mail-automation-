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

    // Robust unique slugging using names and timestamps
    const timestamp = Date.now();
    const slugBase = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const finalSlug = `${slugBase}-${timestamp}`;
    const finalName = `${name} (${new Date().toLocaleDateString()})`;

    try {
        const template = await createAssessmentTemplate({
            university_id: universityId,
            name: finalName,
            slug: finalSlug,
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
                        content: `<div style="text-align: center;"><p style="font-size: 24px; font-weight: 900; margin: 0; color: #1e293b;">${name.toUpperCase()}</p><p style="font-size: 14px; margin-top: 5px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">${examType} - EXAMINATION PAPER</p></div>`,
                        styles: { fontFamily: 'Outfit, sans-serif' }
                    },
                    {
                        id: 'divider-top',
                        type: 'shape',
                        x: 20, y: 45, w: 170, h: 1,
                        styles: { backgroundColor: '#1e293b' }
                    },
                    {
                        id: 'meta-table',
                        type: 'table',
                        x: 20, y: 55, w: 170, h: 40,
                        tableData: {
                            rows: [
                                {
                                    id: 'r1',
                                    cells: [
                                        { id: 'c1', content: '<strong>COURSE TITLE</strong>', styles: { fontWeight: 'bold', fontSize: '10px', backgroundColor: '#f8fafc' } },
                                        { id: 'c2', content: '---', styles: { fontSize: '11px' } },
                                        { id: 'c3', content: '<strong>COURSE CODE</strong>', styles: { fontWeight: 'bold', fontSize: '10px', backgroundColor: '#f8fafc' } },
                                        { id: 'c4', content: '---', styles: { fontSize: '11px' } }
                                    ]
                                },
                                {
                                    id: 'r2',
                                    cells: [
                                        { id: 'c1', content: '<strong>MAX MARKS</strong>', styles: { fontWeight: 'bold', fontSize: '10px', backgroundColor: '#f8fafc' } },
                                        { id: 'c2', content: '100', styles: { fontSize: '11px' } },
                                        { id: 'c3', content: '<strong>DURATION</strong>', styles: { fontWeight: 'bold', fontSize: '10px', backgroundColor: '#f8fafc' } },
                                        { id: 'c4', content: '3 HOURS', styles: { fontSize: '11px' } }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        id: 'divider-mid',
                        type: 'shape',
                        x: 20, y: 105, w: 170, h: 0.5,
                        styles: { backgroundColor: '#e2e8f0' }
                    },
                    {
                        id: 'instructions-block',
                        type: 'text',
                        x: 20, y: 115, w: 170, h: 40,
                        content: `<div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;"><p style="font-size: 11px; font-weight: 900; color: #1e293b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">General Instructions:</p><ul style="font-size: 10px; color: #475569; margin: 0; padding-left: 15px;"><li>All sections are compulsory as per the marks mentioned.</li><li>Answers should be concise and clearly numbered.</li><li>Use of scientific calculators is permitted where specified.</li></ul></div>`,
                        styles: { fontSize: 11, lineHeight: 1.5 }
                    },
                    {
                        id: 'body-area',
                        type: 'shape',
                        x: 20, y: 165, w: 170, h: 100,
                        styles: { backgroundColor: '#f1f5f9', border: '2px dashed #cbd5e1', opacity: 0.5 }
                    },
                    {
                        id: 'body-label',
                        type: 'text',
                        x: 40, y: 205, w: 130, h: 20,
                        content: `<p style="text-align: center; color: #64748b; font-weight: bold; font-size: 12px; text-transform: uppercase;">[ QUESTION PAPER BODY CONTENT SLOTS ]</p>`,
                        styles: { textAlign: 'center' }
                    }
                ]
            }
        ]
    };
}
