import { seedDefaultPermissions } from './src/db/permissions.js';

async function main() {
    console.log('Seeding default permissions...');
    await seedDefaultPermissions();
    console.log('Done!');
    process.exit(0);
}

main();
