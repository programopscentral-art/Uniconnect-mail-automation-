import { json, error } from '@sveltejs/kit';
import { createAssessmentTemplate } from '@uniconnect/shared';

export const POST = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const exam_type = (formData.get('exam_type') || formData.get('examType') || 'MID1') as string;
    const universityId = (formData.get('universityId') as string) || locals.user.university_id;
    const file = formData.get('file') as File;
    const logoFile = formData.get('logo') as File;

    if (!file || !name) throw error(400, 'Name and Source File are required');

    console.log(`[TEMPLATE_IMPORT] 📥 Received file: ${file.name} for Uni: ${universityId}`);

    // V2 Compatible Mock Layout
    const mockLayout = {
        pages: [
            {
                id: 'p1',
                elements: [
                    {
                        id: 'header-1',
                        type: 'text',
                        x: 20, y: 15, w: 170, h: 25,
                        content: name.toUpperCase(),
                        styles: {
                            fontSize: 24,
                            fontWeight: '900',
                            textAlign: 'center',
                            fontFamily: 'Outfit, sans-serif',
                            color: '#4f46e5'
                        }
                    },
                    {
                        id: 'info-1',
                        type: 'text',
                        x: 20, y: 45, w: 170, h: 40,
                        content: `DRAFT GENERATED FROM: ${file.name}\n\nThis is a structural draft of your design. You can now use the Design Studio to place your university logo, tables, and specific exam sections in the correct locations according to your source document.\n\nType: ${exam_type}`,
                        styles: { fontSize: 13, textAlign: 'center', color: '#64748b', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }
                    },
                    {
                        id: 'meta-table-1',
                        type: 'table',
                        x: 20, y: 90, w: 170, h: 40,
                        tableData: {
                            rows: [
                                { id: 'r1', cells: [{ id: 'c1', content: 'Course Name', styles: { fontWeight: 'bold' } }, { id: 'c2', content: '...', styles: {} }] },
                                { id: 'r2', cells: [{ id: 'c1', content: 'Course Code', styles: { fontWeight: 'bold' } }, { id: 'c2', content: '...', styles: {} }] }
                            ]
                        }
                    }
                ]
            }
        ]
    };

    // Default structure (can be edited later in the visual builder)
    const defaultConfig = [
        {
            id: 'part-a',
            title: 'PART A - Short Questions',
            marks_per_q: 2,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `A-${i}-${Math.random()}`, label: `${i + 1}`, type: 'SINGLE', marks: 2
            }))
        },
        {
            id: 'part-b',
            title: 'PART B - Long Questions',
            marks_per_q: 10,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `B-${i}-${Math.random()}`, label: `${i + 6}`, type: 'OR_GROUP', marks: 10,
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
