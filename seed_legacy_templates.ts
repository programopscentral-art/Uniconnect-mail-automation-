import { createAssessmentTemplate, getAllUniversities } from './packages/shared/src/db/assessments.ts';
import { db } from './packages/shared/src/db/client.ts';

async function seedLegacy() {
    console.log('Starting legacy template seeding...');

    // Crescent University
    const crescentId = '54ea7cbf-6b56-4d8b-9045-2efa02b138ec';
    const cduId = '8e5403f9-505a-44d1-add4-aae3efaa9248';

    const templates = [
        {
            university_id: crescentId,
            name: 'Crescent Standard Format',
            exam_type: 'Semester',
            slug: 'crescent-standard',
            version: 1,
            status: 'published',
            config: {},
            layout_schema: {
                logoUrl: '/crescent-logo.png',
                universityName: 'BS Abdur Rahman Crescent Institute of Science & Technology',
                headerStyle: 'split',
                showMetadataTable: true,
                fontFamily: 'serif'
            }
        },
        {
            university_id: cduId,
            name: 'CDU Chaitanya Format',
            exam_type: 'Internal',
            slug: 'cdu-standard',
            version: 1,
            status: 'published',
            config: {},
            layout_schema: {
                universityName: 'CHAITANYA',
                universitySubName: '(DEEMED TO BE UNIVERSITY)',
                headerStyle: 'centered',
                showMetadataTable: false,
                fontFamily: 'serif',
                primaryColor: '#000000'
            }
        }
    ];

    for (const t of templates) {
        try {
            // Check if exists
            const { rows } = await db.query('SELECT id FROM assessment_templates WHERE university_id = $1 AND slug = $2', [t.university_id, t.slug]);
            if (rows.length === 0) {
                console.log(`Creating template: ${t.name}`);
                await createAssessmentTemplate(t as any);
            } else {
                console.log(`Template already exists: ${t.name}`);
            }
        } catch (e) {
            console.error(`Error creating ${t.name}:`, e);
        }
    }

    // Also add a "Standard" template for ALL universities that don't have one
    const { rows: allUnis } = await db.query('SELECT id, name FROM universities');
    for (const uni of allUnis) {
        if (uni.id === crescentId || uni.id === cduId) continue;

        const { rows: existing } = await db.query('SELECT id FROM assessment_templates WHERE university_id = $1', [uni.id]);
        if (existing.length === 0) {
            console.log(`Seeding Standard Template for ${uni.name}`);
            await createAssessmentTemplate({
                university_id: uni.id,
                name: 'Standard Assessment Format',
                exam_type: 'Semester',
                slug: 'standard-format',
                version: 1,
                status: 'published',
                config: {},
                layout_schema: {
                    universityName: uni.name.toUpperCase(),
                    headerStyle: 'centered',
                    showMetadataTable: false,
                    fontFamily: 'serif'
                }
            } as any);
        }
    }

    console.log('Legacy seeding completed.');
    process.exit(0);
}

seedLegacy();
