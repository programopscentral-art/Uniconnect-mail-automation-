import { db } from '../src/db/client';
import { randomUUID } from 'node:crypto';

async function seedVGUTemplate() {
    const client = await db.pool.connect();
    try {
        console.log('--- Corrected Seeding VGU Template ---');

        // 1. Ensure VGU University exists
        const { rows: univRows } = await client.query(
            'SELECT id FROM universities WHERE name = $1 OR slug = $2',
            ['VGU University', 'vgu-university']
        );

        let universityId;
        if (univRows.length > 0) {
            universityId = univRows[0].id;
            console.log(`✅ Using existing VGU University: ${universityId}`);
        } else {
            const res = await client.query(
                `INSERT INTO universities (name, slug) VALUES ($1, $2) RETURNING id`,
                ['VGU University', 'vgu-university']
            );
            universityId = res.rows[0].id;
            console.log(`✨ Created VGU University: ${universityId}`);
        }

        // 2. Find a valid user to assign as creator
        const { rows: userRows } = await client.query(
            'SELECT id FROM users LIMIT 1'
        );
        const creatorId = userRows.length > 0 ? userRows[0].id : null;
        console.log(`👤 Assigning creator: ${creatorId || 'NULL'}`);

        // 3. Define the Layout Schema (CanonicalTemplate)
        const templateId = randomUUID();

        const createSlot = (id: string, type: any, x: number, y: number, w: number, h: number, fontSize = 9) => ({
            id,
            slot_type: type,
            xMM: x,
            yMM: y,
            widthMM: w,
            heightMM: h,
            style: {
                fontFamily: 'Inter',
                fontSizeMM: fontSize / 2.834,
                fontWeight: 400,
                color: '#000000',
                align: 'left'
            },
            overflow: 'clip',
            repeatable: type === 'QUESTION'
        });

        const slots: Record<string, any> = {};

        // Header Slots
        slots['HDR_programme'] = createSlot('HDR_programme', 'HEADER', 10, 53, 100, 5, 8);
        slots['HDR_course'] = createSlot('HDR_course', 'HEADER', 10, 58, 100, 5, 8);
        slots['HDR_duration'] = createSlot('HDR_duration', 'HEADER', 10, 63, 100, 5, 8);
        slots['HDR_semester'] = createSlot('HDR_semester', 'HEADER', 170, 53, 30, 5, 8);
        slots['HDR_code'] = createSlot('HDR_code', 'HEADER', 170, 58, 30, 5, 8);
        slots['HDR_mm'] = createSlot('HDR_mm', 'HEADER', 170, 63, 30, 5, 8);

        // Instructions
        slots['INST_general'] = createSlot('INST_general', 'INSTRUCTIONS', 10, 68, 190, 5, 8);

        // Course Outcomes
        for (let i = 1; i <= 4; i++) {
            slots[`Q_CO_${i}`] = createSlot(`Q_CO_${i}`, 'QUESTION', 10, 75 + (i * 4), 100, 4, 8);
        }

        // Section A: Questions 1-10
        const startY_A = 120;
        const rowH_A = 15;
        for (let i = 1; i <= 10; i++) {
            const y = startY_A + ((i - 1) * rowH_A);
            slots[`Q_${i}`] = createSlot(`Q_${i}`, 'QUESTION', 35, y, 100, rowH_A - 2, 9);
            slots[`M_${i}`] = createSlot(`M_${i}`, 'MARKS', 145, y, 10, rowH_A - 2, 9);
            slots[`INST_K_${i}`] = createSlot(`INST_K_${i}`, 'INSTRUCTIONS', 160, y, 15, rowH_A - 2, 9);
            slots[`INST_CO_${i}`] = createSlot(`INST_CO_${i}`, 'INSTRUCTIONS', 185, y, 15, rowH_A - 2, 9);
        }

        // Section B: Questions 11-14
        const startY_B = 275;
        const rowH_B = 10;
        for (let i = 11; i <= 14; i++) {
            const y = startY_B + ((i - 11) * rowH_B);
            slots[`Q_${i}`] = createSlot(`Q_${i}`, 'QUESTION', 35, y, 100, rowH_B - 2, 9);
            slots[`M_${i}`] = createSlot(`M_${i}`, 'MARKS', 145, y, 10, rowH_B - 2, 9);
            slots[`INST_K_${i}`] = createSlot(`INST_K_${i}`, 'INSTRUCTIONS', 160, y, 15, rowH_B - 2, 9);
            slots[`INST_CO_${i}`] = createSlot(`INST_CO_${i}`, 'INSTRUCTIONS', 185, y, 15, rowH_B - 2, 9);
        }

        const layoutSchema = {
            templateId,
            blueprint_id: `bp_vgu_${Date.now()}`,
            universityId,
            template_type: 'exam_question_paper',
            version: 1,
            page: { widthMM: 210, heightMM: 297 },
            staticElements: [
                { id: 'logo', type: 'rect', xMM: 10, yMM: 10, widthMM: 25, heightMM: 25, backgroundColor: '#f0f0f0' },
                { id: 'title', type: 'text', xMM: 40, yMM: 15, widthMM: 130, heightMM: 10, content: 'VIVEKANANDA GLOBAL UNIVERSITY, JAIPUR', style: { fontFamily: 'Inter', fontSizeMM: 14 / 2.834, fontWeight: 700, align: 'center' } },
                { id: 'exam', type: 'text', xMM: 40, yMM: 35, widthMM: 130, heightMM: 10, content: 'II MID TERM EXAMINATIONS (THEORY), December 2025', style: { fontFamily: 'Inter', fontSizeMM: 10 / 2.834, fontWeight: 700, align: 'center' } }
            ],
            slots,
            constraints: { max_questions_per_page: 20 }
        };

        // 4. Insert Template with correct columns
        await client.query(
            `INSERT INTO assessment_templates 
            (id, university_id, name, slug, exam_type, config, layout_schema, assets_json, version, status, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (university_id, name, version) DO UPDATE SET layout_schema = EXCLUDED.layout_schema`,
            [
                templateId,
                universityId,
                'VGU Standard Mid-Term Template',
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

        console.log('✅ VGU Template Seeded Successfully!');

    } catch (err) {
        console.error('❌ Seeding Failed:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

seedVGUTemplate();
