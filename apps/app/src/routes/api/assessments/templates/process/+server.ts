import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExtractionEngine } from '$lib/server/services/extraction-engine';
import { FigmaService } from '$lib/server/services/figma-service';
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
        width: z.number().optional(),
        height: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        text: z.string().optional(),
        value: z.string().optional(),
        style: z.record(z.any()).optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('field'),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        value: z.string().optional(),
        text: z.string().optional(),
        fieldType: z.string().optional(),
        is_header: z.boolean().optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('rect'),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        strokeWidth: z.number().optional(),
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
        w: z.number().optional(),
        h: z.number().optional(),
        strokeWidth: z.number().optional(),
        orientation: z.enum(['horizontal', 'vertical']).optional(),
        color: z.string().optional()
    }).passthrough(),
    z.object({
        id: z.string(),
        type: z.literal('image-slot'),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        slotName: z.string().optional()
    }).passthrough()
]);

// V34: Standardize elements for store
const standardizeElement = (el: any) => {
    return {
        ...el,
        w: el.w ?? el.width ?? 0.1,
        h: el.h ?? el.height ?? 0.05,
        value: el.value ?? el.text ?? el.value ?? ''
    };
};

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

    // V38 Diagnostic: Masked DB connectivity check
    const dbUri = process.env.DATABASE_URL || '';
    console.log(`[V38_PROCESS] 🛠️ DB Check: ${dbUri.substring(0, 15)}... (len: ${dbUri.length})`);

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
    const explicitRegions = formData.get('regions') as string;
    const explicitBackground = formData.get('backgroundImageUrl') as string;
    const figmaFileUrl = formData.get('figmaFileUrl') as string;
    const figmaAccessToken = formData.get('figmaAccessToken') as string;
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
    } else if (figmaFileUrl && figmaAccessToken) {
        // --- V62: Figma-First Import ---
        try {
            const fileKey = figmaFileUrl.split('/file/')[1]?.split('/')[0] || figmaFileUrl;
            const elements = await FigmaService.importFromFigma(fileKey, figmaAccessToken);

            // For now, we assume the first frame is the A4 container for normalization
            // In a production scenario, we'd allow the user to select the frame
            detectedLayout = {
                page: { width: 210, height: 297, unit: "mm" },
                pages: [{
                    id: 'page-1',
                    elements: elements
                }],
                metadata_fields: {},
                originalWidth: 210,
                originalHeight: 297
            };
            console.log(`[V62_PROCESS] 🎨 Figma import successful: ${elements.length} slots extracted`);
        } catch (fe: any) {
            console.error(`[V62_PROCESS] ❌ Figma Import Failure:`, fe);
            return json({ success: false, message: `Figma Sync Failed: ${fe.message}` }, { status: 500 });
        }
    } else if (file) {
        // --- V49: Granular Element Extraction ---
        try {
            const { GranularExtractionEngine } = await import('$lib/server/services/granular-extraction-engine');
            const extractor = new GranularExtractionEngine();
            let buffer = Buffer.from(await file.arrayBuffer());

            if (file.type === 'application/pdf') {
                const pdfArray = await pdf.convert(buffer, { page_numbers: [1] });
                buffer = Buffer.from(pdfArray[0]);
            }

            // Use granular extraction to get individual elements
            const result = await extractor.analyzeDocument(buffer, 210, 297); // A4 dimensions in mm

            detectedLayout = {
                page: { width: 210, height: 297, unit: "mm" },
                pages: [{
                    id: 'page-1',
                    elements: result.elements.map(el => ({
                        id: el.id,
                        type: el.type,
                        x: el.x,
                        y: el.y,
                        w: el.w,
                        h: el.h,
                        text: el.text,
                        value: el.text,
                        style: el.style,
                        role: el.role,
                        row: el.row,
                        col: el.col
                    }))
                }],
                metadata_fields: result.metadata,
                originalWidth: 210,
                originalHeight: 297,
                debugImage: result.backgroundImage,
                regions: result.elements // V49: Store elements as regions for compatibility
            };

            console.log(`[V49_PROCESS] ✅ Generated ${result.elements.length} granular elements`);
        } catch (re: any) {
            console.error(`[V49_PROCESS] ❌ Granular Extraction Failure:`, re);
            return json({ success: false, message: re.message || 'Granular Analysis Failed' }, { status: 500 });
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

    // V34: Standardize all elements for Design Studio editability
    const finalLayout = JSON.parse(JSON.stringify(validation.data));
    if (finalLayout.pages) {
        finalLayout.pages = finalLayout.pages.map((p: any) => ({
            ...p,
            elements: (p.elements || []).map(standardizeElement)
        }));
    }
    if (finalLayout.regions) {
        finalLayout.regions = finalLayout.regions.map(standardizeElement);
    }

    try {
        const slug = `${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;
        console.log(`[V34_PROCESS] 💾 Committing to DB: slug="${slug}"`);

        let template;
        try {
            template = await createAssessmentTemplate({
                university_id: universityId,
                name: `${name} (Imported ${new Date().toLocaleDateString()})`,
                slug,
                exam_type: exam_type,
                status: 'draft',
                layout_schema: finalLayout,
                backgroundImageUrl: finalLayout.debugImage,
                regions: finalLayout.regions || finalLayout.pages?.[0]?.elements || [],
                config: defaultConfig,
                assets: [],
                created_by: locals.user.id
            });
        } catch (dbErr: any) {
            console.error(`[V38_DB_CRITICAL] 🚨 Database Save Failure:`, dbErr);
            return json({
                success: false,
                message: `Database Persistence Failed: ${dbErr.message}`,
                detail: dbErr.detail || dbErr.hint || 'No Postgres hints available',
                code: dbErr.code
            }, { status: 500 });
        }

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
