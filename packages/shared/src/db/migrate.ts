import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Force ignore SSL errors for migrations (especially on Railway/CI)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HARDCODED_DB_URL = "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
const dbUrl = process.env.DATABASE_URL || HARDCODED_DB_URL;
const connectionString = dbUrl.includes('?') ? `${dbUrl}&sslmode=no-verify` : `${dbUrl}?sslmode=no-verify`;

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');
        // Create migrations table if not exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id serial PRIMARY KEY,
        name text NOT NULL,
        run_at timestamptz DEFAULT now()
      );
    `);

        // Get applied migrations
        const { rows: appliedRows } = await client.query('SELECT name FROM _migrations');
        const applied = new Set(appliedRows.map((r) => r.name));

        // Get migration files
        const migrationsDir = path.join(__dirname, '../../migrations');
        const files = fs.readdirSync(migrationsDir).sort();

        for (const file of files) {
            if (!file.endsWith('.sql')) continue;
            if (applied.has(file)) continue;

            console.log(`Running migration: ${file}`);
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf-8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`Migration ${file} completed.`);
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(`Migration ${file} failed:`, e);
                process.exit(1);
            }
        }
        console.log('All migrations applied.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
