const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&sslmode=require",
    ssl: {
        rejectUnauthorized: false
    }
});

async function diagnose() {
    console.log('🔍 VGU TOPIC & GENERATION DIAGNOSTIC\n');

    // 1. Check for duplicate topics
    console.log('1️⃣ Checking for duplicate topics...');
    const dupQuery = `
        SELECT t.name, t.unit_id, COUNT(*) as dup_count 
        FROM assessment_topics t 
        GROUP BY t.name, t.unit_id 
        HAVING COUNT(*) > 1 
        ORDER BY dup_count DESC 
        LIMIT 10
    `;
    const dups = await pool.query(dupQuery);
    console.log(`Found ${dups.rows.length} duplicate topic groups:`);
    console.table(dups.rows);

    // 2. Check for whitespace issues
    console.log('\n2️⃣ Checking for whitespace issues...');
    const wsQuery = `
        SELECT name, LENGTH(name) as len, LENGTH(TRIM(name)) as trimmed_len
        FROM assessment_topics 
        WHERE name != TRIM(name) 
        LIMIT 20
    `;
    const ws = await pool.query(wsQuery);
    console.log(`Found ${ws.rows.length} topics with whitespace issues:`);
    console.table(ws.rows);

    // 3. Sample topics from a specific subject
    console.log('\n3️⃣ Sampling topics from first subject...');
    const sampleQuery = `
        SELECT t.id, t.name, u.unit_number, 
               (SELECT COUNT(*) FROM assessment_questions WHERE topic_id = t.id) as q_count
        FROM assessment_topics t
        JOIN assessment_units u ON t.unit_id = u.id
        WHERE u.subject_id = (SELECT id FROM assessment_subjects LIMIT 1)
        ORDER BY u.unit_number, t.name
        LIMIT 20
    `;
    const sample = await pool.query(sampleQuery);
    console.log(`Sample topics:`);
    console.table(sample.rows);

    // 4. Check if questions have topic_id
    console.log('\n4️⃣ Checking question-topic linkage...');
    const linkQuery = `
        SELECT 
            COUNT(*) as total_questions,
            COUNT(topic_id) as questions_with_topic,
            COUNT(*) - COUNT(topic_id) as questions_without_topic
        FROM assessment_questions
    `;
    const link = await pool.query(linkQuery);
    console.log('Question-topic linkage:');
    console.table(link.rows);

    pool.end();
}

diagnose().catch(console.error);
