import { db } from './client';

async function main() {
    console.log('Adding Central University...');
    await db.query(
        `INSERT INTO universities (name, slug) 
         VALUES ($1, $2) 
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
        ['Central University', 'central-university']
    );
    console.log('Done!');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
