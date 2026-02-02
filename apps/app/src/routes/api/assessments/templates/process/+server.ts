import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LayoutReconstructor } from '$lib/server/services/layout-reconstructor';
import { createAssessmentTemplate } from '@uniconnect/shared';
import { env } from '$env/dynamic/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

// Zod Schema for Layout Validation (Master Source of Truth)
const LayoutElementSchema = z.discriminatedUnion('type', [
    z.object({ id: z.string(), type: z.literal('text'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), content: z.string(), styles: z.record(z.any()).optional() }),
    z.object({ id: z.string(), type: z.literal('image'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), src: z.string(), alt: z.string().optional(), styles: z.record(z.any()).optional() }),
    z.object({ id: z.string(), type: z.literal('table'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), tableData: z.any(), styles: z.record(z.any()).optional() }),
    z.object({ id: z.string(), type: z.literal('line'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), orientation: z.enum(['horizontal', 'vertical']), thickness: z.number(), color: z.string(), styles: z.record(z.any()).optional() }),
    z.object({ id: z.string(), type: z.literal('shape'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), shapeType: z.enum(['rectangle', 'circle']), backgroundColor: z.string(), borderWidth: z.number(), borderColor: z.string(), styles: z.record(z.any()).optional() })
]);

const LayoutSchema = z.object({
    page: z.object({
        width: z.enum(['A4', 'LETTER', 'LEGAL']),
        unit: z.enum(['mm', 'px']),
        margins: z.object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() })
    }),
    pages: z.array(z.object({
        id: z.string(),
        elements: z.array(LayoutElementSchema)
    }))
});

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const exam_type = (formData.get('exam_type') || formData.get('examType') || 'MID1') as string;
    const universityId = (formData.get('universityId') as string) || locals.user.university_id;
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
    try {
        // Prepare data for Python service
        const buffer = Buffer.from(await file.arrayBuffer());
        const extractFormData = new FormData();
        extractFormData.append('file', new Blob([buffer]), file.name);

        // Deployment Readiness: Use EXTRACTOR_SERVICE_URL from ENV
        const serviceRoot = (env.EXTRACTOR_SERVICE_URL || 'http://localhost:5000').replace(/\/$/, '');
        const extractUrl = `${serviceRoot}/api/extract-template`;

        console.log(`[TEMPLATE_IMPORT] 🛰️ Forwarding to Extraction Service`);

        let extractRes;
        try {
            extractRes = await fetch(extractUrl, {
                method: 'POST',
                body: extractFormData
            });
        } catch (fetchErr: any) {
            console.error(`[TEMPLATE_IMPORT] ❌ Connectivity Error:`, fetchErr);
            // Privacy: Do not show internal URLs to the user in the frontend error
            throw new Error(`System Connectivity Error: The layout analysis engine is currently unreachable. Please try again in a few minutes or contact support.`);
        }

        if (!extractRes.ok) {
            const errBody = await extractRes.text();
            console.error(`[TEMPLATE_IMPORT] ❌ Service Error (${extractRes.status}):`, errBody);
            throw new Error(`Analysis Engine Error: We encountered an issue while processing your document layout.`);
        }

        const extractData = await extractRes.json();
        if (!extractData.success) {
            console.error(`[TEMPLATE_IMPORT] ❌ Business Logic Error:`, extractData.error);
            throw new Error(extractData.error || 'The analysis engine could not parse this document format.');
        }

        detectedLayout = extractData.data;
        console.log(`[TEMPLATE_IMPORT] 🎯 Extraction Successful: ${detectedLayout.pages[0].elements.length} elements detected`);
    } catch (re: any) {
        console.error(`[TEMPLATE_IMPORT] ❌ Process Failure:`, re);
        return json({
            success: false,
            message: re.message || 'System Analysis Failed'
        }, { status: 500 });
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
