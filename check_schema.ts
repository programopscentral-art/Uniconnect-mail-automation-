import { db } from './packages/shared/src/db/client';

async function debug() {
    console.log("Checking plagiarism_documents table structure...");
    try {
        const { rows } = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'plagiarism_documents'
        `);

        if (rows.length === 0) {
            console.log("Table 'plagiarism_documents' does not exist.");
        } else {
            console.log("Columns in 'plagiarism_documents':", JSON.stringify(rows, null, 2));
        }
    } catch (e) {
        console.error("Error checking table:", e);
    }
    process.exit(0);
}

debug();
