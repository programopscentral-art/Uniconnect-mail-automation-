import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { upsertOpsExternalData } from '@uniconnect/shared';

function validateApiKey(request: Request): boolean {
    const validKey = (env.OPS_EXTERNAL_API_KEY || process.env.OPS_EXTERNAL_API_KEY || '').trim();
    if (!validKey) return false;
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    return token === validKey;
}

export const POST: RequestHandler = async ({ request }) => {
    if (!validateApiKey(request)) {
        throw error(401, 'Invalid or missing API key');
    }

    const body = await request.json();
    const { type } = body;

    switch (type) {
        case 'session-data': {
            const { university_name, date, sessions_planned, sessions_completed,
                sessions_cancelled, enrolled, attended } = body;

            if (!university_name || !date) {
                throw error(400, 'university_name and date are required');
            }

            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw error(400, 'Date must be in YYYY-MM-DD format');
            }

            await upsertOpsExternalData({
                university_name,
                date,
                sessions_planned: parseInt(sessions_planned) || 0,
                sessions_completed: parseInt(sessions_completed) || 0,
                sessions_cancelled: parseInt(sessions_cancelled) || 0,
                enrolled: parseInt(enrolled) || 0,
                attended: parseInt(attended) || 0,
            });

            return json({
                success: true,
                message: `Session data for ${university_name} on ${date} synced`,
            });
        }

        case 'batch-data': {
            const { records } = body;
            if (!Array.isArray(records) || !records.length) {
                throw error(400, 'records array is required');
            }

            let processed = 0;
            const errors: string[] = [];

            for (const rec of records) {
                try {
                    if (!rec.university_name || !rec.date) {
                        errors.push(`Missing university_name or date in record`);
                        continue;
                    }
                    await upsertOpsExternalData({
                        university_name: rec.university_name,
                        date: rec.date,
                        sessions_planned: parseInt(rec.sessions_planned) || 0,
                        sessions_completed: parseInt(rec.sessions_completed) || 0,
                        sessions_cancelled: parseInt(rec.sessions_cancelled) || 0,
                        enrolled: parseInt(rec.enrolled) || 0,
                        attended: parseInt(rec.attended) || 0,
                    });
                    processed++;
                } catch (e: any) {
                    errors.push(`${rec.university_name}/${rec.date}: ${e.message}`);
                }
            }

            return json({
                success: processed > 0,
                processed,
                total: records.length,
                errors: errors.length ? errors : undefined,
            });
        }

        default:
            throw error(400, `Unknown type: ${type}. Supported: session-data, batch-data`);
    }
};

export const GET: RequestHandler = async ({ request, url }) => {
    if (!validateApiKey(request)) {
        throw error(401, 'Invalid or missing API key');
    }

    return json({
        status: 'ok',
        service: 'UniConnect Ops External API',
        endpoints: {
            'POST /api/ops/external': {
                types: ['session-data', 'batch-data'],
                fields: 'university_name, date, sessions_planned, sessions_completed, sessions_cancelled, enrolled, attended',
            }
        },
    });
};
