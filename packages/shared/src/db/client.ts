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
    // Idle clients can emit an async 'error' event when the server terminates
    // the connection (e.g. Supabase pooler dropping an idle conn: "terminating
    // connection due to administrator command"). Without a handler, pg
    // re-emits it as an uncaught 'error' on the pool and crashes the process.
    // Log and swallow — the pool will transparently create a new connection.
    internalPool.on('error', (err) => {
        console.error('[DB_POOL] idle client error (non-fatal):', err.message);
    });
    return internalPool;
}

export const db = {
    query: (text: string, params?: any[]) => getPool().query(text, params),
    get pool() {
        return getPool();
    },
    connect: () => getPool().connect(),
};

