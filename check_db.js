const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function check() {
    try {
        const { rows } = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'assessment_templates' 
            AND column_name = 'background_image_url'
        `);
        console.log('Result:', rows);
        if (rows.length > 0) {
            console.log('✅ Column background_image_url FOUND');
        } else {
            console.log('❌ Column background_image_url MISSING');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}
check();
