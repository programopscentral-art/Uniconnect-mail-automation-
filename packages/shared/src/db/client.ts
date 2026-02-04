import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Localize env loading for shared package if run directly (e.g. migrations)
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let internalPool: Pool | null = null;

function getPool() {
    if (internalPool) return internalPool;

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('DATABASE_URL is not set in environment variables.');
    }

    internalPool = new Pool({
        connectionString: dbUrl,
        max: 50,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: {
            rejectUnauthorized: false
        }
    });
    return internalPool;
}

export const db = {
    query: (text: string, params?: any[]) => getPool().query(text, params),
    get pool() {
        return getPool();
    },
};

