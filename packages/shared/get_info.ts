import { db } from './src/db/client.js';

async function getSubjQuestions() {
    try {
        const subjId = '788c751d-69ff-4b5c-b833-bda8704605cd';
        const res = await db.query(`
            SELECT COUNT(*) 
            FROM assessment_questions q
            JOIN assessment_units u ON q.unit_id = u.id
            WHERE u.subject_id = $1
        `, [subjId]);
        console.log(`SUBJ_QUESTIONS:${res.rows[0].count}`);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

getSubjQuestions();
