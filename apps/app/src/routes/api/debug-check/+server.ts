import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export async function GET() {
    let results: any = {};
    const logFiles = ['HOOKS_DEBUG.log', 'global_debug.log', 'AAA_DEBUG.log', 'debug_load.log'];

    for (const f of logFiles) {
        try {
            if (fs.existsSync(f)) {
                results[f] = fs.readFileSync(f, 'utf8').split('\n').slice(-20).join('\n');
            } else {
                results[f] = 'Not found at root';
            }
        } catch (e: any) {
            results[f] = `Error: ${e.message}`;
        }
    }

    return json({
        status: 'ok',
        cwd: process.cwd(),
        timestamp: new Date().toISOString(),
        logs: results
    });
}
