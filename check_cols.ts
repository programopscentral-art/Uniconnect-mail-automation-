import { db } from './packages/shared/src/db/client';

async function checkCols() {
    const tables = ['assessment_subjects', 'assessment_units', 'assessment_topics', 'assessment_practicals', 'assessment_course_outcomes'];
    for (const table of tables) {
        const { rows } = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1
            ORDER BY ordinal_position
        `, [table]);
        console.log(`\nTable: ${table}`);
        console.log(JSON.stringify(rows, null, 2));
    }
}

checkCols().finally(() => process.exit());
