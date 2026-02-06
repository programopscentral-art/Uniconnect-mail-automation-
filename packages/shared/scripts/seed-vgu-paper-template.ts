import { db } from '../src/db/client';
import { randomUUID } from 'node:crypto';

async function seedVGUTemplate() {
    const client = await db.pool.connect();
    try {
        console.log('--- Seeding ENFORCED VGU Image Template ---');

        // 1. VGU University ID (from +page.svelte logic)
        const universityId = 'c40ed15d-b3e4-49ba-a469-b0bd-a2ac8b2A';

        // 2. Find a valid creator
        const { rows: userRows } = await client.query('SELECT id FROM users LIMIT 1');
        const creatorId = userRows.length > 0 ? userRows[0].id : null;

        // 3. Define the Layout Schema (Using image as background)
        const templateId = randomUUID();
        const imagePath = 'C:/Users/karth/.gemini/antigravity/brain/ccc36f5e-943b-4ea3-83c0-392c06c35e49/media__1770297054671.png';

        const createSlot = (id: string, type: any, x: number, y: number, w: number, h: number, fontSize = 9) => ({
            id,
            slot_type: type,
            xMM: x,
            yMM: y,
            widthMM: w,
            heightMM: h,
            style: {
                fontFamily: 'Helvetica', // Standard font for PDF-lib
                fontSizeMM: fontSize / 2.834,
                fontWeight: 400,
                color: '#000000',
                align: 'left'
            },
            overflow: 'clip',
            repeatable: type === 'QUESTION'
        });

        const slots: Record<string, any> = {};

        // Mapping slots according to the provided VGU image design
        // Header info (Programme, Batch, Name, Code, etc.)
        slots['HDR_programme'] = createSlot('HDR_programme', 'HEADER', 35, 78.5, 80, 5, 8);
        slots['HDR_semester'] = createSlot('HDR_semester', 'HEADER', 165, 78.5, 30, 5, 8);
        slots['HDR_course'] = createSlot('HDR_course', 'HEADER', 35, 83.5, 80, 5, 8);
        slots['HDR_code'] = createSlot('HDR_code', 'HEADER', 165, 83.5, 30, 5, 8);
        slots['HDR_duration'] = createSlot('HDR_duration', 'HEADER', 35, 88.5, 80, 4, 8);
        slots['HDR_mm'] = createSlot('HDR_mm', 'HEADER', 165, 88.5, 30, 4, 8);

        // Instructions
        slots['INST_general'] = createSlot('INST_general', 'INSTRUCTIONS', 35, 93.5, 160, 4, 8);

        // Course Outcomes
        for (let i = 1; i <= 4; i++) {
            slots[`Q_CO_${i}`] = createSlot(`Q_CO_${i}`, 'QUESTION', 10, 105 + (i * 4), 100, 4, 8);
        }

        // Section A: Questions 1-10 (Fits into the table in the image)
        const startY_A = 138;
        const rowH_A = 14.5; // Roughly aligned with table rows
        for (let i = 1; i <= 10; i++) {
            const y = startY_A + ((i - 1) * rowH_A);
            slots[`Q_${i}`] = createSlot(`Q_${i}`, 'QUESTION', 35, y, 98, 12, 9);
            slots[`M_${i}`] = createSlot(`M_${i}`, 'MARKS', 145, y, 10, 12, 9);
            slots[`INST_K_${i}`] = createSlot(`INST_K_${i}`, 'INSTRUCTIONS', 160, y, 15, 12, 9);
            slots[`INST_CO_${i}`] = createSlot(`INST_CO_${i}`, 'INSTRUCTIONS', 185, y, 15, 12, 9);
        }

        // Section B: Questions 11-14 (Fits into the table bottom)
        const startY_B = 277;
        const rowH_B = 6.2;
        for (let i = 11; i <= 14; i++) {
            const y = startY_B + ((i - 11) * rowH_B);
            slots[`Q_${i}`] = createSlot(`Q_${i}`, 'QUESTION', 35, y, 98, 5, 9);
            slots[`M_${i}`] = createSlot(`M_${i}`, 'MARKS', 145, y, 10, 5, 9);
            slots[`INST_K_${i}`] = createSlot(`INST_K_${i}`, 'INSTRUCTIONS', 160, y, 15, 5, 9);
            slots[`INST_CO_${i}`] = createSlot(`INST_CO_${i}`, 'INSTRUCTIONS', 185, y, 15, 5, 9);
        }

        const layoutSchema = {
            templateId,
            blueprint_id: `vgu_image_template_v1`,
            universityId,
            template_type: 'exam_question_paper',
            version: 1,
            page: { widthMM: 210, heightMM: 297 },
            backgroundImageUrl: `file:///${imagePath}`,
            staticElements: [], // Everything is in the background image
            slots,
            constraints: { max_questions_per_page: 20 }
        };

        // 4. Update Database
        await client.query(
            `INSERT INTO assessment_templates 
            (id, university_id, name, slug, exam_type, config, layout_schema, assets_json, version, status, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (university_id, name, version) DO UPDATE SET 
                layout_schema = EXCLUDED.layout_schema,
                slug = EXCLUDED.slug`,
            [
                templateId,
                universityId,
                'VGU High-Fidelity Template',
                'vgu-standard-mid-term',
                'MID2',
                JSON.stringify({}),
                JSON.stringify(layoutSchema),
                JSON.stringify([]),
                1,
                'published',
                creatorId
            ]
        );

        console.log('✅ VGU High-Fidelity Template Seeded Successfully!');

    } catch (err) {
        console.error('❌ Seeding Failed:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

seedVGUTemplate();
