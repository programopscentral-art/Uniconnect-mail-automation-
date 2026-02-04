import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExtractionEngine } from '$lib/server/services/extraction-engine';
import pdf from 'pdf-img-convert';
import { z } from 'zod';
import { createAssessmentTemplate } from '@uniconnect/shared';

// V12: Robust Schema supporting both line formats
const LayoutElementSchema = z.discriminatedUnion('type', [
    z.object({
        id: z.string(),
        type: z.literal('text'),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        text: z.string(),
        style: z.record(z.any()).optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('field'),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        value: z.string(),
        fieldType: z.string().optional(),
        is_header: z.boolean().optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('rect'),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        strokeWidth: z.number(),
        backgroundColor: z.string().optional(),
        borderColor: z.string().optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('line'),
        x: z.number().optional(),
        y: z.number().optional(),
        x1: z.number().optional(),
        y1: z.number().optional(),
        x2: z.number().optional(),
        y2: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        strokeWidth: z.number().optional(),
        orientation: z.enum(['horizontal', 'vertical']).optional(),
        color: z.string().optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('image-slot'),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        slotName: z.string()
    }).passthrough()
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
    metadata_fields: z.record(z.string()).optional(),
    originalWidth: z.number().optional(),
    originalHeight: z.number().optional(),
    debugImage: z.string().optional(),
    regions: z.array(z.any()).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const exam_type = (formData.get('exam_type') || formData.get('examType') || 'MID1') as string;
    const universityId = (formData.get('universityId') as string) || (formData.get('university_id') as string) || locals.user.university_id || '';
    const file = formData.get('file') as File;
    const dryRun = formData.get('dryRun') === 'true';

    console.log(`[V32_PROCESS] 📥 Request Received:`, {
        name,
        exam_type,
        universityId,
        fileName: file?.name,
        fileType: file?.type,
        dryRun
    });

    if (!name) {
        return json({ success: false, message: 'Template name is required' }, { status: 400 });
    }

    let detectedLayout;
    let explicitRegions = formData.get('regions') as string;
    let explicitBackground = formData.get('backgroundImageUrl') as string;
    const submittedLayout = formData.get('layout') as string;
    const submittedMetadata = formData.get('metadata') as string;

    if (submittedLayout && !dryRun) {
        console.log(`[V32_PROCESS] ♻️ Processing submitted layout payload...`);
        try {
            detectedLayout = JSON.parse(submittedLayout);
            if (submittedMetadata) {
                detectedLayout.metadata_fields = JSON.parse(submittedMetadata);
            }
            if (explicitRegions) detectedLayout.regions = JSON.parse(explicitRegions);

            // V32: Handle background image as either base64 string or File/Blob
            if (explicitBackground) {
                if (typeof explicitBackground !== 'string' && (explicitBackground as any).arrayBuffer) {
                    const buffer = Buffer.from(await (explicitBackground as any).arrayBuffer());
                    const type = (explicitBackground as any).type || 'image/png';
                    detectedLayout.debugImage = `data:${type};base64,${buffer.toString('base64')}`;
                    console.log(`[V32_PROCESS] 🖼️ Processed binary background image (${buffer.length} bytes)`);
                } else {
                    detectedLayout.debugImage = explicitBackground as string;
                }
            }
        } catch (pe) {
            console.error(`[V32_PROCESS] ❌ Payload Parse Failure:`, pe);
            return json({ success: false, message: 'Invalid layout data received' }, { status: 400 });
        }
    } else if (file) {
        // --- Monolithic Extraction ---
        try {
            const extractor = new ExtractionEngine();
            let buffer = Buffer.from(await file.arrayBuffer());

            if (file.type === 'application/pdf') {
                const pdfArray = await pdf.convert(buffer, { page_numbers: [1] });
                buffer = Buffer.from(pdfArray[0]);
            }

            const blueprint = await extractor.analyze(buffer, file.type);
            detectedLayout = {
                page: { ...blueprint.page, unit: "mm" },
                pages: blueprint.pages,
                metadata_fields: blueprint.metadata_fields || {},
                originalWidth: blueprint.originalWidth,
                originalHeight: blueprint.originalHeight,
                debugImage: blueprint.debugImage
            };
        } catch (re: any) {
            console.error(`[V12_PROCESS] ❌ Extraction Engine Failure:`, re);
            return json({ success: false, message: re.message || 'System Analysis Failed' }, { status: 500 });
        }
    } else {
        return json({ success: false, message: 'Document file or existing layout required' }, { status: 400 });
    }

    // Strict Validation
    const validation = LayoutSchema.safeParse(detectedLayout);
    if (!validation.success) {
        console.error('[V12_PROCESS] ❌ Validation Failed (422):', validation.error.format());
        return json({
            success: false,
            message: 'Architectural Validation Error',
            details: validation.error.format(),
            type: 'VALIDATION_ERROR'
        }, { status: 422 });
    }

    if (dryRun) {
        return json({
            success: true,
            template: { name, exam_type, universityId, layout_schema: validation.data },
            message: 'Analysis successful'
        });
    }

    // Default configuration for slots
    const defaultConfig = [
        {
            id: 'part-a', title: 'PART A - Short Questions', marks_per_q: 2, answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({ id: `A-${i}`, label: `${i + 1}`, type: 'SINGLE', marks: 2 }))
        },
        {
            id: 'part-b', title: 'PART B - Long Questions', marks_per_q: 10, answered_count: 5,
            slots: Array(5).fill(0).map((_, i) => ({
                id: `B-${i}`, label: `${i + 6}`, type: 'OR_GROUP', marks: 10,
                choices: [{ id: `B-${i}-a`, label: `${i + 6} (a)`, marks: 10 }, { id: `B-${i}-b`, label: `${i + 6} (b)`, marks: 10 }]
            }))
        }
    ];

    try {
        const slug = `${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;
        console.log(`[V12_PROCESS] 💾 Committing to DB: slug="${slug}"`);

        const template = await createAssessmentTemplate({
            university_id: universityId,
            name: `${name} (Imported ${new Date().toLocaleDateString()})`,
            slug,
            exam_type: exam_type,
            status: 'draft',
            layout_schema: JSON.parse(JSON.stringify(validation.data)),
            backgroundImageUrl: validation.data.debugImage,
            regions: validation.data.regions || validation.data.pages?.[0]?.elements || [],
            config: defaultConfig,
            assets: [],
            created_by: locals.user.id
        });

        console.log(`[V32_PROCESS] ✅ Successfully Saved: ${template.id}`);

        return json({
            success: true,
            template,
            templateId: template.id,
            message: 'Template library expanded successfully.'
        }, { status: 201 });
    } catch (e: any) {
        console.error(`[V12_PROCESS] ❌ Database Failure:`, e);
        return json({
            success: false,
            message: e.message || 'Storage Failure',
            detail: e.stack
        }, { status: 500 });
    }
};
