import { db } from './client';

async function main() {
    console.log('Adding sort_order column to students table...');
    await db.query(
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0"
    );
    console.log('Successfully added sort_order column.');
    process.exit(0);
}

main().catch(console.error);
