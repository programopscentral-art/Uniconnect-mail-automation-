import { z } from 'zod';

/**
 * MM-Precise Typography Schema
 */
export const TypographySchema = z.object({
    fontFamily: z.string().default('Inter'),
    fontSizeMM: z.number(),
    fontWeight: z.union([z.number(), z.string()]).default(400),
    lineHeightMM: z.number().optional(),
    color: z.string().default('#000000'),
    align: z.enum(['left', 'center', 'right']).default('left'),
});

/**
 * Static Elements (Logos, Borders, Fixed Text)
 */
export const StaticElementSchema = z.discriminatedUnion('type', [
    z.object({
        id: z.string(),
        type: z.literal('text'),
        xMM: z.number(),
        yMM: z.number(),
        widthMM: z.number(),
        heightMM: z.number(),
        content: z.string(),
        style: TypographySchema,
    }),
    z.object({
        id: z.string(),
        type: z.literal('rect'),
        xMM: z.number(),
        yMM: z.number(),
        widthMM: z.number(),
        heightMM: z.number(),
        borderColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        strokeWidthMM: z.number().default(0.2),
    }),
    z.object({
        id: z.string(),
        type: z.literal('image'),
        xMM: z.number(),
        yMM: z.number(),
        widthMM: z.number(),
        heightMM: z.number(),
        url: z.string(),
    }),
    z.object({
        id: z.string(),
        type: z.literal('line'),
        x1MM: z.number(),
        y1MM: z.number(),
        x2MM: z.number(),
        y2MM: z.number(),
        color: z.string().default('#000000'),
        strokeWidthMM: z.number().default(0.2),
    }),
]);

/**
 * Slot Definition (Fillable regions)
 */
export const SlotSchema = z.object({
    id: z.string(),
    slot_type: z.enum(['QUESTION', 'MARKS', 'INSTRUCTIONS', 'HEADER', 'FOOTER']).default('QUESTION'),
    xMM: z.number(),
    yMM: z.number(),
    widthMM: z.number(),
    heightMM: z.number(),
    maxCharacters: z.number().optional(),
    style: TypographySchema,
    overflow: z.enum(['clip', 'shrink', 'next_page', 'push_down']).default('clip'),
    repeatable: z.boolean().default(false),
    isRequired: z.boolean().default(false),
});

/**
 * Canonical Template (The frozen design artifact / Blueprint)
 */
export const CanonicalTemplateSchema = z.object({
    templateId: z.string(),
    blueprint_id: z.string().optional(), // Spec alignment
    universityId: z.string(),
    template_type: z.string().default('exam_question_paper'),
    version: z.number().default(1),
    page: z.object({
        widthMM: z.number().default(210),
        heightMM: z.number().default(297),
    }),
    staticElements: z.array(StaticElementSchema),
    slots: z.record(SlotSchema), // Map of slot name -> Slot definition
    constraints: z.object({
        max_questions_per_page: z.number().optional(),
    }).default({}),
    backgroundImageUrl: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    checksum: z.string().optional(),
    style: z.string().optional(), // 'vgu' | 'crescent' | 'cdu'
});

export type CanonicalTemplate = z.infer<typeof CanonicalTemplateSchema>;
export type StaticElement = z.infer<typeof StaticElementSchema>;
export type SlotDefinition = z.infer<typeof SlotSchema>;
export type Typography = z.infer<typeof TypographySchema>;
