import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LayoutReconstructor } from '$lib/server/services/layout-reconstructor';
import { createAssessmentTemplate } from '@uniconnect/shared';
import { env } from '$env/dynamic/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

// Zod Schema for Layout Validation (Master Source of Truth)
const LayoutElementSchema = z.discriminatedUnion('type', [
    z.object({ id: z.string(), type: z.literal('text'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), text: z.string(), style: z.record(z.any()).optional() }).passthrough(),
    z.object({ id: z.string(), type: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), strokeWidth: z.number(), backgroundColor: z.string().optional(), borderColor: z.string().optional() }).passthrough(),
    z.object({ id: z.string(), type: z.literal('line'), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), strokeWidth: z.number(), orientation: z.enum(['horizontal', 'vertical']).optional(), color: z.string().optional() }).passthrough(),
    z.object({ id: z.string(), type: z.literal('image-slot'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), slotName: z.string() }).passthrough()
]);

const LayoutSchema = z.object({
    page: z.object({
        width: z.number(),
        height: z.number(),
        unit: z.string().optional()
    }),
    pages: z.array(z.object({
        id: z.string(),
        elements: z.array(LayoutElementSchema)
    })).optional(),
    elements: z.array(LayoutElementSchema).optional(),
    dynamicSlots: z.array(z.any()).optional(),
    metadata_fields: z.record(z.string()).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const exam_type = (formData.get('exam_type') || formData.get('examType') || 'MID1') as string;
    const universityId = (formData.get('universityId') as string) || locals.user.university_id || '';
    const file = formData.get('file') as File;
    const dryRun = formData.get('dryRun') === 'true';

    console.log(`[TEMPLATE_IMPORT] 📥 Request: name="${name}", type="${exam_type}", univ="${universityId}", file="${file?.name}", dryRun=${dryRun}`);

    if (!file || !name) {
        console.error('[TEMPLATE_IMPORT] ❌ Missing requirements');
        return json({ success: false, message: 'Name and Source File are required' }, { status: 400 });
    }

    console.log(`[TEMPLATE_IMPORT] 📥 Processing file: ${file.name} (DryRun: ${dryRun}, Univ: ${universityId})`);

    // --- High-Fidelity Layout Reconstruction ---
    let detectedLayout;

    // Check if we already have a reviewed layout/metadata (Final Save)
    const submittedLayout = formData.get('layout') as string;
    const submittedMetadata = formData.get('metadata') as string;

    if (submittedLayout && !dryRun) {
        console.log(`[TEMPLATE_IMPORT] ♻️ Using user-reviewed layout for final save`);
        try {
            detectedLayout = JSON.parse(submittedLayout);
            if (submittedMetadata) {
                detectedLayout.metadata_fields = JSON.parse(submittedMetadata);
            }
        } catch (pe) {
            console.error(`[TEMPLATE_IMPORT] ❌ Failed to parse submitted layout/metadata:`, pe);
            throw new Error('The submitted structural data is corrupted.');
        }
    } else {
        // --- Monolithic Internal Extraction ---
        try {
            const { LayoutExtractor } = await import('$lib/server/services/layout-extractor');
            const extractor = new LayoutExtractor();
            const buffer = Buffer.from(await file.arrayBuffer());
            const blueprint = await extractor.extract(buffer, file.type);

            detectedLayout = {
                page: { ...blueprint.page, unit: "mm", margins: { top: 0, bottom: 0, left: 0, right: 0 } },
                pages: [
                    { id: "p1", elements: blueprint.elements }
                ],
                metadata_fields: blueprint.metadata_fields || {}
            };

            console.log(`[TEMPLATE_IMPORT] 🎯 Monolithic Extraction Successful: ${blueprint.elements.length} elements detected`);
        } catch (re: any) {
            console.error(`[TEMPLATE_IMPORT] ❌ Internal Process Failure:`, re);
            return json({
                success: false,
                message: re.message || 'System Analysis Failed'
            }, { status: 500 });
        }
    }

    // Strict Validation
    const validation = LayoutSchema.safeParse(detectedLayout);
    if (!validation.success) {
        console.error('[TEMPLATE_IMPORT] ❌ Validation Failed:', validation.error);
        return json({
            success: false,
            message: 'Detected layout is architecturally invalid',
            detail: JSON.stringify(validation.error.format()),
            type: 'VALIDATION_ERROR'
        }, { status: 422 });
    }

    // If dryRun, return now
    if (dryRun) {
        return json({
            success: true,
            template: {
                name,
                exam_type,
                universityId,
                layout_schema: validation.data
            },
            message: 'Layout analyzed successfully (Dry Run)'
        });
    }

    // Default Configuration for slots
    const defaultConfig = [
        {
            id: 'part-a',
            title: 'PART A - Short Questions',
            marks_per_q: 2,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `A-${i}-${Math.random().toString(36).slice(2, 9)}`, label: `${i + 1}`, type: 'SINGLE', marks: 2
            }))
        },
        {
            id: 'part-b',
            title: 'PART B - Long Questions',
            marks_per_q: 10,
            answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `B-${i}-${Math.random().toString(36).slice(2, 9)}`, label: `${i + 6}`, type: 'OR_GROUP', marks: 10,
                choices: [
                    { id: `B-${i}-a`, label: `${i + 6} (a)`, marks: 10 },
                    { id: `B-${i}-b`, label: `${i + 6} (b)`, marks: 10 }
                ]
            }))
        }
    ];

    try {
        const timestamp = Date.now();
        const slug = `${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${timestamp}`;

        console.log(`[TEMPLATE_IMPORT] 💾 Saving to DB: slug="${slug}", universityId="${universityId}"`);

        const template = await createAssessmentTemplate({
            university_id: universityId,
            name: `${name} (v${new Date().toLocaleDateString().replace(/\//g, '.')}.${Math.floor(Date.now() / 1000).toString().slice(-4)})`,
            slug,
            exam_type: exam_type,
            status: 'draft',
            source_type: 'imported',
            layout_schema: JSON.parse(JSON.stringify(validation.data)),
            config: JSON.parse(JSON.stringify(defaultConfig)),
            assets: [],
            created_by: locals?.user?.id
        });

        console.log(`[TEMPLATE_IMPORT] ✅ Successfully saved template: ${template.id}`);

        return json({
            success: true,
            template,
            message: 'Template layout reconstructed and isolated. Review in Studio.'
        });
    } catch (e: any) {
        console.error(`[TEMPLATE_IMPORT] ❌ DB SAVE ERROR:`, e);
        return json({
            success: false,
            message: e.message || 'Failed to save template',
            detail: e.stack || 'No stack trace',
            type: 'DATABASE_ERROR'
        }, { status: 500 });
    }
};
