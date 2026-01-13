import { db } from './packages/shared/src/db/client';

const SANJAY_UNI_ID = '1e5f88db-2e3e-4f52-8810-7168e9dec84c';

function getFuzzyNames(name: string): string[] {
    const trimmed = name.trim();
    const names = [trimmed];

    // If it has a prefix like "LLM - " or "WA2 - ", add the part after "-"
    if (trimmed.includes(' - ')) {
        names.push(trimmed.split(' - ').slice(1).join(' - ').trim());
    }

    return Array.from(new Set(names));
}

async function syncSubjects() {
    console.log('--- Starting Fuzzy Syllabus Sync ---');

    // 1. Get all subjects from Sanjay Ghodawat University that have data
    const { rows: sourceSubjects } = await db.query(`
        SELECT DISTINCT s.id, s.name 
        FROM assessment_subjects s
        JOIN assessment_branches b ON s.branch_id = b.id
        JOIN assessment_units u ON u.subject_id = s.id
        WHERE b.university_id = $1
    `, [SANJAY_UNI_ID]);

    console.log(`Found ${sourceSubjects.length} source subjects in Sanjay Ghodawat University.`);

    for (const source of sourceSubjects) {
        const fuzzyNames = getFuzzyNames(source.name);
        console.log(`\nProcessing source: "${source.name}" (Fuzzy: ${fuzzyNames.join(', ')})`);

        // 2. Find matching subjects in other universities
        // We'll use a complex WHERE clause to match any of the fuzzy names
        let queryPart = fuzzyNames.map((_, i) => `s.name ILIKE $${i + 3} OR s.name ILIKE $${i + 3 + fuzzyNames.length}`).join(' OR ');

        const params = [source.id, SANJAY_UNI_ID, ...fuzzyNames.map(n => `%${n}%`), ...fuzzyNames.map(n => n)];

        const { rows: targets } = await db.query(`
            SELECT DISTINCT s.id, s.name, u.name as uni_name
            FROM assessment_subjects s
            JOIN assessment_branches b ON s.branch_id = b.id
            JOIN universities u ON b.university_id = u.id
            WHERE s.id != $1 AND b.university_id != $2 AND (${queryPart})
        `, params);

        if (targets.length === 0) {
            console.log(`  No matching subjects found.`);
            continue;
        }

        console.log(`  Found ${targets.length} targets:`);
        targets.forEach(t => console.log(`    - ${t.name} (${t.uni_name})`));

        // 3. Fetch source data
        const { rows: units } = await db.query('SELECT * FROM assessment_units WHERE subject_id = $1', [source.id]);
        const { rows: topics } = await db.query('SELECT * FROM assessment_topics WHERE unit_id IN (SELECT id FROM assessment_units WHERE subject_id = $1)', [source.id]);
        const { rows: practicals } = await db.query('SELECT * FROM assessment_practicals WHERE subject_id = $1', [source.id]);
        const { rows: cos } = await db.query('SELECT * FROM assessment_course_outcomes WHERE subject_id = $1', [source.id]);

        for (const target of targets) {
            console.log(`    -> Syncing target ID: ${target.id} (${target.name})`);

            // Clear existing data
            await db.query('DELETE FROM assessment_units WHERE subject_id = $1', [target.id]);
            await db.query('DELETE FROM assessment_practicals WHERE subject_id = $1', [target.id]);
            await db.query('DELETE FROM assessment_course_outcomes WHERE subject_id = $1', [target.id]);

            // Copy Units and Topics
            const unitMap = new Map();
            for (const unit of units) {
                const { rows: [newUnit] } = await db.query(
                    'INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING id',
                    [target.id, unit.unit_number, unit.name]
                );
                unitMap.set(unit.id, newUnit.id);
            }

            const topicMap = new Map();
            // First pass for root topics
            const rootTopics = topics.filter(t => !t.parent_topic_id);
            for (const topic of rootTopics) {
                const newUnitId = unitMap.get(topic.unit_id);
                if (!newUnitId) continue;
                const { rows: [newTopic] } = await db.query(
                    'INSERT INTO assessment_topics (unit_id, name) VALUES ($1, $2) RETURNING id',
                    [newUnitId, topic.name]
                );
                topicMap.set(topic.id, newTopic.id);
            }

            // Second pass for sub-topics
            const subTopics = topics.filter(t => t.parent_topic_id);
            for (const topic of subTopics) {
                const newUnitId = unitMap.get(topic.unit_id);
                const newParentId = topicMap.get(topic.parent_topic_id);
                if (!newUnitId || !newParentId) continue;
                await db.query(
                    'INSERT INTO assessment_topics (unit_id, name, parent_topic_id) VALUES ($1, $2, $3)',
                    [newUnitId, topic.name, newParentId]
                );
            }

            // Copy Practicals
            for (const p of practicals) {
                await db.query(
                    'INSERT INTO assessment_practicals (subject_id, name, description) VALUES ($1, $2, $3)',
                    [target.id, p.name, p.description]
                );
            }

            // Copy COs
            for (const co of cos) {
                await db.query(
                    'INSERT INTO assessment_course_outcomes (subject_id, code, description) VALUES ($1, $2, $3)',
                    [target.id, co.code, co.description]
                );
            }
        }
    }
    console.log('\n--- Sync Complete ---');
}

syncSubjects().catch(console.error).finally(() => process.exit());
