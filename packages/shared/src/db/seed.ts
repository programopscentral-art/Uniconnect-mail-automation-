import { pool } from './client';

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Seeding database...');
        // Seed logic here
        // e.g. create admin user if not exists
        console.log('Seeding completed.');
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
