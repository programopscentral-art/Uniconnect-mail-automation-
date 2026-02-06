process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log('--- Starting VGU Style Seed ---');
    const univId = 'c40ed15d-b3e4-49ba-b1c4-71a2a8526a6f';

    // We move away from coordinate-based background images to a First-Class "vgu" style
    const layout = {
        templateId: crypto.randomUUID(),
        blueprint_id: 'vgu_high_fidelity_v2',
        universityId: univId,
        style: 'vgu', // THIS TRIGGERS THE NEW RENDERER
        logoUrl: '/vgu-logo.png',
        page: { widthMM: 210, heightMM: 297 },
        staticElements: [],
        slots: {} // Slots are now handled by the first-class "vgu" table layout
    };

    // VGU Structure: 10 MCQ (1M) + 4 LONG (5M)
    const config = [
        {
            title: 'Section A (1*10=10 Marks) Answer all Question No- 1-10',
            marks_per_q: 1,
            count: 10,
            answered_count: 10,
            slots: Array.from({ length: 10 }, (_, i) => ({
                id: crypto.randomUUID(),
                slot_id: `Q_${i + 1}`,
                label: `${i + 1}`,
                marks: 1,
                type: 'SINGLE',
                qType: 'MCQ',
                part: 'A'
            }))
        },
        {
            title: 'Section B (5*3=15 Marks) Attempt any three questions',
            marks_per_q: 5,
            count: 4,
            answered_count: 3,
            slots: Array.from({ length: 4 }, (_, i) => ({
                id: crypto.randomUUID(),
                slot_id: `Q_${i + 11}`,
                label: `Q.${i + 11}`,
                marks: 5,
                type: 'SINGLE',
                qType: 'LONG',
                part: 'B'
            }))
        }
    ];

    try {
        // We UPSERT based on university_id and slug to ensure we override the existing one
        await pool.query(
            "INSERT INTO assessment_templates (id, university_id, name, slug, exam_type, layout_schema, config, status, version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (university_id, name, version) DO UPDATE SET layout_schema = EXCLUDED.layout_schema, config = EXCLUDED.config, slug = EXCLUDED.slug",
            [crypto.randomUUID(), univId, 'VGU High-Fidelity Template', 'vgu-standard-mid-term', 'MID2', JSON.stringify(layout), JSON.stringify(config), 'published', 1]
        );
        console.log('✅ SEEDED VGU STYLE SUCCESS');
    } catch (e) {
        console.error('❌ SEED ERROR:', e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

run();
