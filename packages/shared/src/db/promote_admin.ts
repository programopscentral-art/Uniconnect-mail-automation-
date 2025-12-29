import { db } from './client';

async function main() {
    await db.query(
        "UPDATE users SET role = 'ADMIN', university_id = NULL WHERE email = 'programopscentral@nxtwave.in'"
    );
    console.log('Promoted programopscentral@nxtwave.in to ADMIN role');
    process.exit(0);
}

main().catch(console.error);
